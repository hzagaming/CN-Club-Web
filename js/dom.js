/** Required page elements fail with a useful message rather than a later null error. */
export function element(selector, scope = document) {
    const found = scope.querySelector(selector);
    if (!found)
        throw new Error(`页面缺少必要元素：${selector}`);
    return found;
}
