export type A11yImpact = 'minor' | 'moderate' | 'serious' | 'critical';

export interface A11yFinding {
  id: string;
  impact: A11yImpact;
  message: string;
  target?: string;
}

export interface TouchTargetFinding {
  id: string;
  message: string;
}

const INTERACTIVE_SELECTOR = 'button, a[href], input, select, textarea, [role="button"]';
const FOCUSABLE_SELECTOR = 'button, a[href], input, select, textarea, [tabindex]';
const REFERENCE_ATTRIBUTES = [
  'aria-labelledby',
  'aria-describedby',
  'aria-controls',
  'aria-owns',
  'aria-activedescendant',
];

function compact(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function ownerDocumentOf(root: ParentNode): Document {
  if ('documentElement' in root && root.nodeType === 9) return root as Document;
  return (root as Element).ownerDocument ?? globalThis.document;
}

function targetOf(element: Element): string {
  const testId = element.getAttribute('data-testid');
  const id = element.getAttribute('id');
  const tag = element.tagName.toLowerCase();
  if (testId) return `${tag}[data-testid="${testId}"]`;
  if (id) return `${tag}#${id}`;
  const className = compact(element.getAttribute('class'));
  return className ? `${tag}.${className.split(' ')[0]}` : tag;
}

function referencedText(element: Element, doc: Document): string {
  const ids = compact(element.getAttribute('aria-labelledby')).split(' ').filter(Boolean);
  return ids.map((id) => compact(doc.getElementById(id)?.textContent)).filter(Boolean).join(' ');
}

function explicitLabelText(element: Element, doc: Document): string {
  const id = element.getAttribute('id');
  if (!id) return '';
  const labels = Array.from(doc.querySelectorAll('label')).filter(
    (label) => label.getAttribute('for') === id,
  );
  return labels.map((label) => compact(label.textContent)).filter(Boolean).join(' ');
}

function accessibleName(element: Element, doc: Document): string {
  const ariaLabel = compact(element.getAttribute('aria-label'));
  if (ariaLabel) return ariaLabel;

  const labelledBy = referencedText(element, doc);
  if (labelledBy) return labelledBy;

  const title = compact(element.getAttribute('title'));
  if (title) return title;

  const wrappingLabel = element.closest('label');
  if (wrappingLabel) {
    const labelText = compact(wrappingLabel.textContent);
    if (labelText) return labelText;
  }

  const explicit = explicitLabelText(element, doc);
  if (explicit) return explicit;

  return compact(element.textContent);
}

function push(
  findings: A11yFinding[],
  id: string,
  impact: A11yImpact,
  message: string,
  target?: string,
): void {
  findings.push({ id, impact, message, ...(target ? { target } : {}) });
}

export function auditAccessibility(root: ParentNode): A11yFinding[] {
  const findings: A11yFinding[] = [];
  const doc = ownerDocumentOf(root);
  const elements = Array.from(root.querySelectorAll('*'));

  const ids = new Map<string, Element[]>();
  for (const element of elements) {
    const id = element.getAttribute('id');
    if (!id) continue;
    const list = ids.get(id) ?? [];
    list.push(element);
    ids.set(id, list);
  }
  for (const [id, matches] of ids) {
    if (matches.length > 1) {
      push(
        findings,
        'duplicate-id',
        'serious',
        `id "${id}" is used ${matches.length} times`,
        `#${id}`,
      );
    }
  }

  for (const element of elements) {
    const tag = element.tagName.toLowerCase();

    if (tag === 'button') {
      if (!accessibleName(element, doc)) {
        push(findings, 'button-name', 'serious', 'Button has no accessible name', targetOf(element));
      }
      if (element.querySelector(INTERACTIVE_SELECTOR)) {
        push(
          findings,
          'nested-interactive',
          'serious',
          'Interactive control is nested inside a button',
          targetOf(element),
        );
      }
    }

    if (tag === 'a' && element.hasAttribute('href')) {
      if (!accessibleName(element, doc)) {
        push(findings, 'link-name', 'serious', 'Link has no accessible name', targetOf(element));
      }
      if (element.querySelector(INTERACTIVE_SELECTOR)) {
        push(
          findings,
          'nested-interactive',
          'serious',
          'Interactive control is nested inside a link',
          targetOf(element),
        );
      }
    }

    if (tag === 'img') {
      if (!element.hasAttribute('alt')) {
        push(findings, 'image-alt', 'serious', 'Image is missing an alt attribute', targetOf(element));
      }
    }

    const role = element.getAttribute('role');
    if (role === 'img' && !accessibleName(element, doc)) {
      push(findings, 'image-alt', 'serious', 'Role="img" element has no accessible name', targetOf(element));
    }

    const namedByAuthor = element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby');
    if (
      namedByAuthor &&
      (tag === 'div' || tag === 'span' || tag === 'p') &&
      (role === null || role === 'generic' || role === 'presentation' || role === 'none')
    ) {
      push(
        findings,
        'aria-prohibited-attr',
        'serious',
        'aria-label is not allowed on an element with a generic role',
        targetOf(element),
      );
    }

    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      const type = (element.getAttribute('type') ?? '').toLowerCase();
      const implicitButton = type === 'submit' || type === 'button' || type === 'reset';
      if (type !== 'hidden' && !implicitButton && !accessibleName(element, doc)) {
        push(findings, 'label', 'serious', 'Form control has no accessible label', targetOf(element));
      }
      if (type === 'submit' && !accessibleName(element, doc)) {
        push(findings, 'input-button-name', 'serious', 'Submit input has no accessible name', targetOf(element));
      }
    }

    const ariaHidden = element.getAttribute('aria-hidden');
    if (ariaHidden === 'true') {
      const focusable = Array.from(element.querySelectorAll(FOCUSABLE_SELECTOR)).filter((node) => {
        if (node.matches(':disabled')) return false;
        const tabIndex = node.getAttribute('tabindex');
        return tabIndex === null || Number(tabIndex) >= 0;
      });
      if (focusable.length > 0) {
        push(
          findings,
          'aria-hidden-focus',
          'serious',
          'aria-hidden="true" contains a focusable control',
          targetOf(element),
        );
      }
    }

    const tabIndex = element.getAttribute('tabindex');
    if (tabIndex !== null && Number(tabIndex) > 0) {
      push(
        findings,
        'tabindex',
        'serious',
        `tabindex="${tabIndex}" puts the element out of DOM order`,
        targetOf(element),
      );
    }

    for (const attribute of REFERENCE_ATTRIBUTES) {
      const value = compact(element.getAttribute(attribute));
      if (!value) continue;
      for (const id of value.split(' ')) {
        if (!doc.getElementById(id)) {
          push(
            findings,
            'aria-valid-attr-value',
            'serious',
            `${attribute} references missing id "${id}"`,
            targetOf(element),
          );
        }
      }
    }
  }

  const headings = elements.filter((element) => /^h[1-6]$/.test(element.tagName.toLowerCase()));
  if (!headings.some((heading) => heading.tagName.toLowerCase() === 'h1')) {
    push(findings, 'page-has-heading-one', 'moderate', 'Page has no level-one heading');
  }
  let previousLevel = 0;
  for (const heading of headings) {
    const level = Number(heading.tagName.slice(1));
    if (previousLevel > 0 && level > previousLevel + 1) {
      push(
        findings,
        'heading-order',
        'moderate',
        `Heading level jumps from h${previousLevel} to h${level}`,
        targetOf(heading),
      );
    }
    previousLevel = level;
  }

  const mains = elements.filter((element) => element.tagName.toLowerCase() === 'main');
  if (mains.length !== 1) {
    push(findings, 'landmark-one-main', 'moderate', `Expected one main landmark, found ${mains.length}`);
  }

  if (root.nodeType === 9) {
    const html = (root as Document).documentElement;
    if (!compact(html.getAttribute('lang'))) {
      push(findings, 'html-has-lang', 'serious', 'Document has no lang attribute', 'html');
    }
  }

  return findings;
}

export function seriousA11yFindings(findings: readonly A11yFinding[]): A11yFinding[] {
  return findings.filter((finding) => finding.impact === 'serious' || finding.impact === 'critical');
}

export function auditTouchTargetCss(css: string): TouchTargetFinding[] {
  const findings: TouchTargetFinding[] = [];
  const blocks = Array.from(
    css.matchAll(/@media[^{]*(?:620px|pointer:\s*coarse)[^{]*\{([\s\S]*?)\n\}/g),
    (match) => match[1] ?? '',
  );
  const block = blocks.find((candidate) => /min-height:\s*44px/.test(candidate)) ?? blocks[0] ?? '';
  if (!block) {
    findings.push({
      id: 'touch-target-media',
      message: 'No max-width: 620px touch-target media block is present',
    });
    return findings;
  }
  if (!/min-height:\s*44px/.test(block)) {
    findings.push({
      id: 'touch-target-height',
      message: 'Mobile controls do not declare a 44px minimum height',
    });
  }
  if (!/min-width:\s*44px/.test(block)) {
    findings.push({
      id: 'touch-target-width',
      message: 'Mobile controls do not declare a 44px minimum width',
    });
  }
  if (!/\.switch/.test(block)) {
    findings.push({
      id: 'touch-target-switch',
      message: 'The settings switch is not included in the mobile target audit',
    });
  }
  return findings;
}

export function auditReducedMotionCss(css: string): A11yFinding[] {
  const findings: A11yFinding[] = [];
  if (
    !/\[data-reduced-motion=['"]true['"]\][\s\S]{0,500}animation-duration:\s*0\.001ms/.test(css) ||
    !/\[data-reduced-motion=['"]true['"]\][\s\S]{0,500}transition-duration:\s*0\.001ms/.test(css)
  ) {
    push(
      findings,
      'reduced-motion-attribute',
      'serious',
      'The reduced-motion data attribute does not neutralize animation and transition duration',
    );
  }
  if (
    !/@media \(prefers-reduced-motion: reduce\)[\s\S]{0,500}animation-duration:\s*0\.001ms/.test(css) ||
    !/@media \(prefers-reduced-motion: reduce\)[\s\S]{0,500}transition-duration:\s*0\.001ms/.test(css)
  ) {
    push(
      findings,
      'reduced-motion-media',
      'serious',
      'prefers-reduced-motion is not honored in CSS',
    );
  }
  return findings;
}
