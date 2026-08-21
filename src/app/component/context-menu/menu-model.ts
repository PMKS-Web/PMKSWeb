/**
 * What a right-click menu is made of.
 *
 * The old menu was a flat `cMenuItem[]`: eight equally weighted rows with
 * Delete at the top, labels that rewrote themselves as the object changed
 * ("Add Ground" becoming "Remove Ground"), and three different ways of saying
 * no -- hidden here, greyed silently there, offered-and-then-refused by a
 * snackbar somewhere else.
 *
 * This is the shape the redesign asks for instead. A menu is a header naming
 * what was clicked, then a fixed ladder of groups -- Attach, State, Machine --
 * and a destructive footer, so a two-row menu and a twelve-row menu read the
 * same way and the flick to Delete always lands on the last row.
 */

/** Why a row cannot be used, in the words the model already uses. */
export interface MenuRefusal {
  /** Three or four words, shown in the row's right-hand slot. */
  short: string;
  /** The model's own sentence, on hover, where one exists. */
  long?: string;
}

export type MenuRowKind = 'action' | 'toggle';

export class MenuRow {
  /** Title Case, because it labels a control (`docs/ui-vocabulary.md`). */
  label: string;
  /** A registered SVG icon name, or a Material Icons ligature. */
  icon: string;
  /** Whether `icon` is a Material Icons ligature rather than a registered SVG. */
  material = false;
  kind: MenuRowKind;
  action: () => void;
  /** For a toggle: whether the state it names is on. */
  checked = false;
  /** Set when the row is greyed. Its presence *is* the disabled flag. */
  refusal?: MenuRefusal;
  /** Keys from the shortcut registry, so a hint cannot drift from its key. */
  shortcut?: string;
  /** The footer row: red, and always last. */
  destructive = false;
  /**
   * Whether this row works away from the start pose.
   *
   * Almost nothing does: editing a mechanism parked mid-cycle would write the
   * pose it is standing in back into the drawing. The exceptions are rows that
   * do not touch the mechanism at all -- the synthesis positions are a note
   * about what it was designed for, the trace is a view of it, and crossing
   * into another mode changes nothing about the drawing.
   */
  alwaysAllowed = false;
  /** A plain-language description for the row, when the label needs help. */
  tip?: string;
  /**
   * The right-hand slot on an *available* row: a count, where one says
   * something ("6 open"), and the shortcut otherwise.
   */
  hint?: string;

  constructor(init: Partial<MenuRow> & Pick<MenuRow, 'label' | 'icon' | 'action'>) {
    this.label = init.label;
    this.icon = init.icon;
    this.action = init.action;
    this.material = init.material ?? false;
    this.kind = init.kind ?? 'action';
    this.checked = init.checked ?? false;
    this.refusal = init.refusal;
    this.shortcut = init.shortcut;
    this.destructive = init.destructive ?? false;
    this.alwaysAllowed = init.alwaysAllowed ?? false;
    this.tip = init.tip;
    this.hint = init.hint;
  }

  get disabled(): boolean {
    return !!this.refusal;
  }

  /** The dark chip on hover: the model's sentence, or the row's own note. */
  get hoverText(): string {
    return this.refusal?.long ?? this.tip ?? '';
  }
}

/** One rung of the ladder. The label is dropped on an unlabelled footer. */
export interface MenuGroup {
  /** Upper-cased in the stylesheet; written here as a plain word. */
  label?: string;
  rows: MenuRow[];
}

/** The way out of this mode, as one icon beside the target's name. */
export interface MenuCrossing {
  icon: string;
  material?: boolean;
  /** Tooltip, with the mode's shortcut on the end. */
  tip: string;
  refusal?: MenuRefusal;
  action: () => void;
}

/** Who the menu is about: "Joint B", "Pin · Links AB, BC". */
export interface MenuHeader {
  title: string;
  subtitle: string;
  crossing?: MenuCrossing;
}

export interface ContextMenuModel {
  header?: MenuHeader;
  groups: MenuGroup[];
}

/** Whether there is anything at all to show. */
export function menuIsEmpty(model: ContextMenuModel): boolean {
  return model.groups.every((group) => group.rows.length === 0);
}

/**
 * Where the last right-click was, in client coordinates.
 *
 * The menu wants this so the card can grow from the corner the pointer is in,
 * and it cannot ask the canvas for it: the CDK's own `contextmenu` listener
 * runs before the template's, so by the time the canvas has recorded the point
 * the card has already been created and measured. A capture-phase listener,
 * installed once at start-up, is ahead of both.
 */
let lastPointer = { x: 0, y: 0 };
let tracking = false;

export function trackContextMenuPointer(): void {
  if (tracking || typeof document === 'undefined') return;
  tracking = true;
  document.addEventListener(
    'contextmenu',
    (event) => {
      lastPointer = { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };
    },
    true
  );
}

export function lastContextMenuPointer(): { x: number; y: number } {
  return lastPointer;
}
