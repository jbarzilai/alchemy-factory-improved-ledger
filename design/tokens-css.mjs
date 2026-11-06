export function renderTokensCss(tokens) {
  const block = (selector, entries) => `${selector} {\n${entries.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`;
  let css = '/* Generated from design/tokens.json by npm run tokens. Do not edit. */\n';
  for (const [index, theme] of tokens.color.themes.entries()) {
    css += block(`${index === 0 ? ':root, ' : ''}[data-theme="${theme.id}"]`, [
      ...[...tokens.color.tokens, ...tokens.shadow.tokens].map(t => [`--${t.name}`, t.value[theme.id]]),
      ['color-scheme', theme.id],
    ]);
  }
  css += block(':root', [
    ...[...tokens.spacing.tokens, ...tokens.radius.tokens].map(t => [`--${t.name}`, t.value]),
    ...Object.entries(tokens.type.families).map(([key, value]) => [`--font-${key}`, value]),
  ]);
  for (const group of tokens.type.groups) for (const style of group.styles) {
    css += block(`.${style.name}`, [
      ['font-family', `var(--font-${group.family})`], ['font-size', style.fontSize],
      ['line-height', style.lineHeight], ['font-weight', style.fontWeight],
      ...(style.letterSpacing ? [['letter-spacing', style.letterSpacing]] : []),
    ]);
  }
  return css;
}
