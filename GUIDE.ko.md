# Build Your Own React — 한국어 학습 정리본

원문: https://pomb.us/build-your-own-react/ (Rodrigo Pombo)

> 원문 산문을 그대로 번역한 것이 아니라, 같은 구성과 코드에 한국어 설명을 붙인 학습용 정리본입니다.
> 코드는 원문의 `Didact` 구현을 따릅니다. 직접 타이핑하며 따라가는 것을 권장합니다.

우리가 단계별로 추가할 기능:
- **Step I**: `createElement` 함수
- **Step II**: `render` 함수
- **Step III**: Concurrent Mode (동시성 모드)
- **Step IV**: Fibers (파이버)
- **Step V**: Render와 Commit 단계 분리
- **Step VI**: Reconciliation (재조정)
- **Step VII**: Function Components (함수 컴포넌트)
- **Step VIII**: Hooks

---

## Step 0: Review (복습)

먼저 React의 기본 3줄을 봅시다.

```js
const element = <h1 title="foo">Hello</h1>;
const container = document.getElementById("root");
ReactDOM.render(element, container);
```

이걸 "순수 자바스크립트"로 한 줄씩 풀어쓰면 React가 내부에서 무슨 일을 하는지 보입니다.

**(1) JSX는 createElement 호출이다.**
`<h1 title="foo">Hello</h1>` 는 빌드 도구(Babel 등)에 의해
`React.createElement("h1", { title: "foo" }, "Hello")` 로 변환됩니다.

`createElement`는 인자를 받아 아래 같은 **객체**를 만들 뿐입니다:

```js
const element = {
  type: "h1",
  props: {
    title: "foo",
    children: "Hello",
  },
};
```

- `type`: 만들 DOM 노드의 태그 이름(문자열). 함수 컴포넌트인 경우 함수.
- `props`: JSX 속성 전부 + 특별한 `children` 키.

**(2) `ReactDOM.render`는 객체를 보고 DOM을 만든다.**

```js
const node = document.createElement(element.type);
node["title"] = element.props.title;

const text = document.createTextNode("");
text["nodeValue"] = element.props.children;

node.appendChild(text);
container.appendChild(node);
```

- 텍스트("Hello")는 `textContent` 대신 `createTextNode`로 처리합니다.
  나중에 모든 자식을 같은 방식으로 다루기 위함입니다.

이제 React와 ReactDOM을 우리 것으로 교체해 나갑니다. 이름은 **Didact**.

---

## Step I: `createElement` 함수

목표: JSX → `{ type, props }` 객체로 바꾸는 함수.

```js
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === "object" ? child : createTextElement(child)
      ),
    },
  };
}
```

- `...children` (rest 파라미터): 세 번째 이후 인자를 모두 배열로 받습니다.
  그래서 `children`은 **항상 배열**이 됩니다.
- 자식이 객체(엘리먼트)면 그대로, 문자열·숫자처럼 객체가 아니면 `createTextElement`로 감쌉니다.

원시값(텍스트)을 감싸는 함수:

```js
function createTextElement(text) {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: [],
    },
  };
}
```

- React는 자식이 없을 때 원시값을 이렇게 감싸지 않지만, 우리는 코드를 단순하게 하려고 감쌉니다.
  (성능보다 단순함을 택함.)

이제 이름을 붙입니다:

```js
const Didact = {
  createElement,
};

const element = Didact.createElement(
  "div",
  { id: "foo" },
  Didact.createElement("a", null, "bar"),
  Didact.createElement("b")
);
```

**JSX를 그대로 쓰고 싶다면?** 파일 상단에 주석으로 변환 함수를 지정합니다(Babel 사용 시):

```js
/** @jsx Didact.createElement */
const element = (
  <div id="foo">
    <a>bar</a>
    <b />
  </div>
);
```

> 이 저장소에서는 `vite.config.js`의 `jsxFactory: "Didact.createElement"` 설정이 같은 역할을 합니다.

---

## Step II: `render` 함수

목표: 엘리먼트 객체를 받아 실제 DOM에 그리기. 일단 추가(생성)만 다룹니다.

```js
function render(element, container) {
  const dom =
    element.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(element.type);

  const isProperty = (key) => key !== "children";
  Object.keys(element.props)
    .filter(isProperty)
    .forEach((name) => {
      dom[name] = element.props[name];
    });

  element.props.children.forEach((child) => render(child, dom));

  container.appendChild(dom);
}

const Didact = {
  createElement,
  render,
};
```

- 엘리먼트 타입으로 DOM 노드를 만듭니다. `TEXT_ELEMENT`면 텍스트 노드.
- `children`을 제외한 props를 노드에 그대로 할당합니다.
- 각 자식에 대해 **재귀적으로** `render`를 호출합니다.
- 다 만든 노드를 부모(container)에 붙입니다.

여기까지면 JSX를 우리 라이브러리로 DOM에 그릴 수 있습니다.

**문제점:** 이 재귀는 한 번 시작하면 **트리 전체를 다 그릴 때까지 멈출 수 없습니다.** 트리가 크면 메인 스레드를 오래 점유해, 사용자 입력·애니메이션이 끊깁니다. → Step III에서 해결.

---

## Step III: Concurrent Mode (동시성 모드)

재귀를 버리고, 작업을 **작은 단위(unit of work)** 로 쪼갭니다. 한 단위를 끝낼 때마다 브라우저가 급한 일(입력 등)이 있으면 우리 작업을 잠시 멈출 수 있게 합니다.

```js
let nextUnitOfWork = null;

function workLoop(deadline) {
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }
  requestIdleCallback(workLoop);
}

requestIdleCallback(workLoop);

function performUnitOfWork(nextUnitOfWork) {
  // TODO
}
```

- `requestIdleCallback`: 브라우저가 한가할 때 콜백을 실행. `deadline.timeRemaining()`으로 남은 여유 시간을 알 수 있습니다.
  (React는 실제로는 이걸 안 쓰고 자체 스케줄러(scheduler)를 씁니다. 개념은 같습니다.)
- `shouldYield`: 여유 시간이 거의 없으면 루프를 양보(yield)하고 다음 idle까지 대기.

다음 할 일을 찾고, 작업을 쪼개려면 자료구조가 필요합니다 → Step IV: Fibers.

---

## Step IV: Fibers

각 엘리먼트마다 **fiber** 하나를 둡니다. fiber는 하나의 작업 단위입니다.

fiber는 세 개의 링크를 가집니다:
- `child`: 첫 번째 자식
- `sibling`: 다음 형제
- `parent`(원문에선 `parent`/`return`): 부모

예를 들어 다음 트리는:
```
   root
    |
   div
  /  |  \
 h1  ...  a
  |
  p
```
fiber 링크로 이렇게 순회합니다: **자식 → 형제 → (없으면) 부모의 형제** 순으로 다음 작업을 찾습니다.

`render`는 첫 작업 단위(root fiber)를 세팅합니다:

```js
function render(element, container) {
  nextUnitOfWork = {
    dom: container,
    props: {
      children: [element],
    },
  };
}

let nextUnitOfWork = null;
```

`performUnitOfWork`가 하는 일 3가지:
1. 엘리먼트를 DOM에 추가
2. 자식들의 fiber 생성
3. 다음 작업 단위 반환

```js
function performUnitOfWork(fiber) {
  // 1) DOM 노드가 없으면 생성
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }

  // (주의: 아래 줄은 Step V에서 제거됩니다 — 중간에 DOM을 직접 붙이면 안 됨)
  if (fiber.parent) {
    fiber.parent.dom.appendChild(fiber.dom);
  }

  // 2) 자식 fiber 생성 + 링크 연결
  const elements = fiber.props.children;
  let index = 0;
  let prevSibling = null;

  while (index < elements.length) {
    const element = elements[index];

    const newFiber = {
      type: element.type,
      props: element.props,
      parent: fiber,
      dom: null,
    };

    if (index === 0) {
      fiber.child = newFiber;      // 첫 자식
    } else {
      prevSibling.sibling = newFiber; // 그 다음부터는 형제
    }

    prevSibling = newFiber;
    index++;
  }

  // 3) 다음 작업 단위 찾기: 자식 → 형제 → 부모의 형제 ...
  if (fiber.child) {
    return fiber.child;
  }
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
}
```

DOM 노드 생성 로직은 `createDom`으로 분리(기존 render에서 추출):

```js
function createDom(fiber) {
  const dom =
    fiber.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);

  const isProperty = (key) => key !== "children";
  Object.keys(fiber.props)
    .filter(isProperty)
    .forEach((name) => {
      dom[name] = fiber.props[name];
    });

  return dom;
}
```

---

## Step V: Render와 Commit 단계 분리

**문제:** Step IV는 작업할 때마다 DOM에 바로 붙입니다. 그런데 작업은 중간에 멈출 수 있으므로, **사용자가 완성되지 않은 UI를 볼 수 있습니다.**

**해결:** 작업 단계(render phase)에서는 DOM을 건드리지 않고, fiber 트리만 만듭니다. 트리를 다 만들면 한 번에 DOM에 반영(commit phase)합니다.

`performUnitOfWork`에서 DOM 붙이는 부분 제거:

```js
// 아래 코드를 삭제
if (fiber.parent) {
  fiber.parent.dom.appendChild(fiber.dom);
}
```

작업 중인 트리의 루트를 추적:

```js
function render(element, container) {
  wipRoot = {
    dom: container,
    props: {
      children: [element],
    },
  };
  nextUnitOfWork = wipRoot;
}

let nextUnitOfWork = null;
let wipRoot = null;  // work in progress root
```

작업이 다 끝나면(`nextUnitOfWork`가 없으면) 커밋:

```js
function workLoop(deadline) {
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }

  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }

  requestIdleCallback(workLoop);
}
```

커밋: 전체 fiber 트리를 재귀적으로 DOM에 붙임:

```js
function commitRoot() {
  commitWork(wipRoot.child);
  wipRoot = null;
}

function commitWork(fiber) {
  if (!fiber) {
    return;
  }
  const domParent = fiber.parent.dom;
  domParent.appendChild(fiber.dom);
  commitWork(fiber.child);
  commitWork(fiber.sibling);
}
```

---

## Step VI: Reconciliation (재조정)

지금까지는 "추가"만 했습니다. 이제 업데이트와 삭제도 해야 합니다.
새 엘리먼트 트리를, 마지막으로 DOM에 커밋했던 fiber 트리와 비교합니다.

마지막으로 커밋한 트리를 저장: `currentRoot`. 각 fiber에 `alternate`(이전 커밋의 대응 fiber)를 둡니다.

```js
function commitRoot() {
  commitWork(wipRoot.child);
  currentRoot = wipRoot;   // 이번 트리를 "현재"로 저장
  wipRoot = null;
}

function render(element, container) {
  wipRoot = {
    dom: container,
    props: { children: [element] },
    alternate: currentRoot,  // 이전 트리 연결
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
}

let nextUnitOfWork = null;
let currentRoot = null;
let wipRoot = null;
let deletions = null;   // 삭제할 노드 목록
```

`performUnitOfWork`에서 자식 fiber 생성 부분을 `reconcileChildren`으로 분리:

```js
function performUnitOfWork(fiber) {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }

  const elements = fiber.props.children;
  reconcileChildren(fiber, elements);

  if (fiber.child) {
    return fiber.child;
  }
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
}
```

핵심: 이전 fiber와 새 엘리먼트를 비교:

```js
function reconcileChildren(wipFiber, elements) {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling = null;

  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    let newFiber = null;

    const sameType = oldFiber && element && element.type === oldFiber.type;

    // (1) 타입이 같으면 → DOM 재사용, props만 업데이트(UPDATE)
    if (sameType) {
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: "UPDATE",
      };
    }
    // (2) 타입이 다르고 새 엘리먼트가 있으면 → 새 노드 생성(PLACEMENT)
    if (element && !sameType) {
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: "PLACEMENT",
      };
    }
    // (3) 타입이 다르고 옛 fiber가 있으면 → 삭제(DELETION)
    if (oldFiber && !sameType) {
      oldFiber.effectTag = "DELETION";
      deletions.push(oldFiber);
    }

    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }

    if (index === 0) {
      wipFiber.child = newFiber;
    } else if (element) {
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index++;
  }
}
```

> React는 여기서 `key`를 써서 자식 위치 변화를 더 잘 처리합니다. 우리는 생략.

커밋 시 effectTag에 따라 처리:

```js
function commitRoot() {
  deletions.forEach(commitWork);
  commitWork(wipRoot.child);
  currentRoot = wipRoot;
  wipRoot = null;
}

function commitWork(fiber) {
  if (!fiber) {
    return;
  }
  const domParent = fiber.parent.dom;

  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    domParent.removeChild(fiber.dom);
  }

  commitWork(fiber.child);
  commitWork(fiber.sibling);
}
```

props/이벤트 리스너 비교 갱신:

```js
const isEvent = (key) => key.startsWith("on");
const isProperty = (key) => key !== "children" && !isEvent(key);
const isNew = (prev, next) => (key) => prev[key] !== next[key];
const isGone = (prev, next) => (key) => !(key in next);

function updateDom(dom, prevProps, nextProps) {
  // 사라졌거나 바뀐 이벤트 리스너 제거
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // 사라진 속성 제거
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = "";
    });

  // 새로 생기거나 바뀐 속성 설정
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = nextProps[name];
    });

  // 새 이벤트 리스너 등록
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });
}
```

`createDom`도 `updateDom`을 쓰도록 단순화 가능:

```js
function createDom(fiber) {
  const dom =
    fiber.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);

  updateDom(dom, {}, fiber.props);
  return dom;
}
```

---

## Step VII: Function Components

함수 컴포넌트는 두 가지가 다릅니다:
1. fiber의 `type`이 **함수**다.
2. 자식(children)을 **함수를 실행해서** 얻는다. DOM 노드는 없다.

```js
function App(props) {
  return Didact.createElement("h1", null, "Hi ", props.name);
}
// JSX로는: function App(props) { return <h1>Hi {props.name}</h1>; }
const element = Didact.createElement(App, { name: "foo" });
```

`performUnitOfWork`를 함수/일반으로 분기:

```js
function performUnitOfWork(fiber) {
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }

  // 다음 작업 단위 찾기 (동일)
  if (fiber.child) {
    return fiber.child;
  }
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
}

function updateFunctionComponent(fiber) {
  const children = [fiber.type(fiber.props)]; // 함수 실행해서 children 얻기
  reconcileChildren(fiber, children);
}

function updateHostComponent(fiber) {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  reconcileChildren(fiber, fiber.props.children);
}
```

**commit 수정:** 함수 컴포넌트 fiber는 DOM이 없으므로,
- 부모 DOM을 찾을 때 DOM 있는 조상까지 올라가야 하고,
- 삭제할 때 DOM 있는 자식까지 내려가야 합니다.

```js
function commitWork(fiber) {
  if (!fiber) {
    return;
  }

  let domParentFiber = fiber.parent;
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent; // DOM 있는 부모까지 올라감
  }
  const domParent = domParentFiber.dom;

  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    commitDeletion(fiber, domParent);
  }

  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function commitDeletion(fiber, domParent) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    commitDeletion(fiber.child, domParent); // DOM 있는 자식까지 내려감
  }
}
```

---

## Step VIII: Hooks

함수 컴포넌트에 상태(state)를 넣는 `useState`.

```js
function Counter() {
  const [state, setState] = Didact.useState(1);
  return Didact.createElement(
    "h1",
    { onClick: () => setState((c) => c + 1) },
    "Count: ",
    state
  );
}
const element = Didact.createElement(Counter);
```

함수 컴포넌트를 실행하기 전에 전역 변수들을 세팅:

```js
let wipFiber = null;
let hookIndex = null;

function updateFunctionComponent(fiber) {
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = [];   // 한 컴포넌트가 useState를 여러 번 호출할 수 있으므로 배열
  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
}
```

`useState` 구현:

```js
function useState(initial) {
  // 이전 렌더의 같은 위치(hookIndex) hook 가져오기
  const oldHook =
    wipFiber.alternate &&
    wipFiber.alternate.hooks &&
    wipFiber.alternate.hooks[hookIndex];

  const hook = {
    state: oldHook ? oldHook.state : initial,
    queue: [],   // setState로 들어온 갱신 액션들
  };

  // 지난번 큐에 쌓인 액션들을 모두 적용해 현재 state 계산
  const actions = oldHook ? oldHook.queue : [];
  actions.forEach((action) => {
    hook.state = action(hook.state);
  });

  // setState: 액션을 큐에 넣고, 새 렌더(작업)를 예약
  const setState = (action) => {
    hook.queue.push(action);
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot,
    };
    nextUnitOfWork = wipRoot;
    deletions = [];
  };

  wipFiber.hooks.push(hook);
  hookIndex++;
  return [hook.state, setState];
}
```

- `setState(action)`: `action`은 `(prevState) => newState` 함수.
- `setState`가 호출되면 새 `wipRoot`를 만들어 `nextUnitOfWork`로 지정 → workLoop가 다시 렌더 시작.
- 다음 렌더 때 `oldHook.queue`의 액션들을 순서대로 적용해 새 state를 만듭니다.

마지막으로 export:

```js
const Didact = {
  createElement,
  render,
  useState,
};
```

---

## 끝!

이제 우리만의 React가 완성됐습니다. 정리하면:
- **createElement / render**: JSX → 객체 → DOM
- **Concurrent + Fiber**: 작업을 쪼개 멈출 수 있게
- **Render/Commit 분리**: 완성된 트리만 한 번에 반영
- **Reconciliation**: 이전 트리와 비교해 PLACEMENT/UPDATE/DELETION
- **Function Components / Hooks**: 함수 컴포넌트와 useState

실제 React와의 차이(직접 더 알아볼 거리):
- 우리는 렌더 단계에서 트리 전체를 순회하지만, React는 변경 없는 서브트리는 건너뜀.
- 커밋 단계도 우리는 매번 전체 트리를 도는 반면 React는 변경된 fiber만 담은 연결 리스트를 순회.
- `key`, `useEffect` 등은 미구현.
- React의 스케줄러는 `requestIdleCallback`가 아님.
