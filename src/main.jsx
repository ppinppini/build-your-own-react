// 여기에 직접 JSX를 작성하고 Didact.render(element, container) 로 그려보세요.
// 예시:
// const element = <h1 title="foo">Hello</h1>;
// const container = document.getElementById("root");
// Didact.render(element, container);

import Didact from "./didact";

const element = Didact.createElement(
  "div",
  { id: "foo" },
  Didact.createElement("a", null, "bar"),
  Didact.createElement("b"),
);

console.log(element);
