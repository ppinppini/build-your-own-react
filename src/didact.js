// =====================================================================
// Didact — 직접 만드는 React
// 여기에 직접 작성하세요.
//
// Step I:  createElement  — JSX를 { type, props } 객체로
// Step II: render         — 객체 트리를 실제 DOM으로
// Step III~VIII: Concurrent / Fibers / Commit / Reconciliation / Components / Hooks
// =====================================================================

const Didact = {
  // createElement,
  createElement,
  // render,
};

function createElement(type, props, ...children) {
  return {
    type: type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === "object" ? child : createTextElement(child),
      ),
    },
  };
}

function createTextElement(text) {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: [],
    },
  };
}

export default Didact;
