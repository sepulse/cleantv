// Small DOM test double for the application's event/state transitions, not layout.
export function createDocument() {
  let document;
  class Element {
    children = [];
    attributes = {};
    listeners = {};
    className = '';
    replacements = 0;
    constructor(tag, text = '') { this.tagName = tag; this.text = text; }
    append(...children) {
      for (const child of children) {
        const node = child instanceof Element ? child : new Element('#text', String(child));
        node.parentElement = this;
        this.children.push(node);
      }
    }
    replaceChildren(...children) { this.children = []; this.append(...children); this.replacements++; }
    setAttribute(key, value) { this.attributes[key] = value; if (key === 'id') this.id = value; }
    addEventListener(name, handler) { this.listeners[name] = handler; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this.text = String(value); this.children = []; }
    get classList() { return { add: value => { this.className += ` ${value}`; } }; }
    find(predicate) {
      if (predicate(this)) return this;
      for (const child of this.children) { const found = child.find(predicate); if (found) return found; }
      return null;
    }
    querySelector(selector) { return this.find(node => node.tagName === selector); }
    closest(tag) { return this.tagName === tag ? this : this.parentElement?.closest(tag); }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
  }
  const root = new Element('main');
  root.id = 'app';
  const header = new Element('header');
  header.id = 'header';
  document = {
    root, header, activeElement: null, documentElement: {},
    createElement: tag => new Element(tag),
    createElementNS: (_ns, tag) => new Element(tag),
    createTextNode: value => new Element('#text', String(value)),
    getElementById: id => root.find(node => node.id === id) ?? header.find(node => node.id === id),
    querySelector: selector => selector === 'meta[name="cleantv-token"]' ? { content: 'test' } : null,
  };
  return { document, Node: Element };
}
