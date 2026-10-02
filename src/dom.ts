/** Required page elements fail with a useful message rather than a later null error. */
export function element<T extends Element = HTMLElement>(
  selector: string,
  scope: ParentNode = document,
): T {
  const found = scope.querySelector<T>(selector);
  if (!found) throw new Error(`页面缺少必要元素：${selector}`);
  return found;
}
