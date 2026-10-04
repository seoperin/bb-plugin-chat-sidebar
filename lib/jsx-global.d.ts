// @dnd-kit's type declarations still name the global `JSX` namespace, which
// React 19's types no longer provide. This points it at `React.JSX`, so the
// library checks (`skipLibCheck: false`) keep passing without turning off.
import type * as React from "react";

declare global {
  namespace JSX {
    type Element = React.JSX.Element;
    type ElementClass = React.JSX.ElementClass;
    type IntrinsicElements = React.JSX.IntrinsicElements;
  }
}
