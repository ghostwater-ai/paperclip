import { describe, expect, it } from "vitest";
import { App } from "./App";

type RouteLike = {
  props?: {
    path?: string;
    children?: unknown;
  };
};

function collectRoutePaths(node: unknown, paths: string[] = []): string[] {
  if (!node || typeof node !== "object") return paths;

  const route = node as RouteLike;
  if (route.props?.path) paths.push(route.props.path);

  const children = route.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      collectRoutePaths(child, paths);
    }
  } else if (children) {
    collectRoutePaths(children, paths);
  }

  return paths;
}

describe("App routes", () => {
  it("includes unprefixed redirects for project budget routes", () => {
    const paths = collectRoutePaths(App());
    expect(paths).toContain("projects/:projectId/budget");
  });
});
