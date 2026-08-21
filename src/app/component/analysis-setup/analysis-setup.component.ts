import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Joint, RealJoint } from '../../model/joint';
import { Link, RealLink, SliderBlock } from '../../model/link';
import { MechanismService } from '../../services/mechanism.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { SettingsService } from '../../services/settings.service';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { MechanismReadiness, ReadinessCheck } from '../../model/mechanism/readiness';
import { MatIcon } from '@angular/material/icon';
import { ScrollShadowDirective } from '../../scroll-shadow.directive';
import { NotificationService } from '../../services/notification.service';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { InputComponent } from '../BLOCKS/input/input.component';
import { Subscription } from 'rxjs';
import { NOT_A } from '../../ui-text';
import { EditPanelComponent } from '../edit-panel/edit-panel.component';

/** One editable row of the mass table: a body, and what to call it. */
export interface MassRow {
  body: Link;
  label: string;
  isBlock: boolean;
}

/**
 * What stands between this drawing and its animation, mechanism by mechanism.
 *
 * The app used to answer "why is nothing happening?" with one sentence about
 * the whole document, first blocker wins — which for a drawing holding several
 * machines is a sentence about whichever of them the loop reached first. Each
 * is now listed on its own, with its own blockers, and each blocker says the
 * way out rather than only naming the wall.
 *
 * Anything that is fine says nothing at all. A list of green ticks reads as
 * reassurance the first time and as noise every time after, and it buries the
 * one line that matters.
 */
@Component({
  selector: 'app-analysis-setup',
  templateUrl: './analysis-setup.component.html',
  styleUrls: ['./analysis-setup.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon, ScrollShadowDirective, ReactiveFormsModule, InputComponent],
})
export class AnalysisSetupComponent {
  mechanism = inject(MechanismService);
  activeObj = inject(ActiveObjService);
  private tabs = inject(SelectedTabService);
  nup = inject(NumberUnitParserService);
  settings = inject(SettingsService);
  private notify = inject(NotificationService);

  /**
   * Which question this drawer is answering.
   *
   * The two are separate drawers because they have different fixes: a
   * mechanism that will not run and a force analysis with nothing to react
   * against are not the same problem, and a reader refused by one mode should
   * not have to read past the other's list to find out why.
   */
  readonly mode = input<'kinematic' | 'force'>('kinematic');
  /** Which mechanisms the reader has folded away, by id. */
  private collapsed = new Set<string>();
  unassignedOpen = false;
  forceOpen = true;
  massesOpen = true;

  get readiness(): MechanismReadiness[] {
    return this.mechanism.readinessOfEachMechanism();
  }

  get unassigned() {
    return this.mechanism.unassignedReports();
  }

  /**
   * What force analysis still wants, listed beside the kinematic blockers
   * rather than in a drawer of its own.
   *
   * The two questions have different answers but the same shape, and a reader
   * who has just been refused by one tab is well served by seeing what the
   * other would say too. Only shown while something is outstanding: a met
   * requirement is a tick nobody needs to read twice.
   */
  get forceRequirements() {
    // Blockers first: the mock puts the thing that stops the analysis above
    // the thing merely worth a look, whatever order the service found them.
    return this.mechanism
      .forceAnalysisRequirements()
      .slice()
      .sort((a, b) => (a.warning ? 1 : 0) - (b.warning ? 1 : 0));
  }

  get forceOutstanding(): number {
    return this.forceRequirements.filter((requirement) => !requirement.met && !requirement.warning)
      .length;
  }

  get forceWarnings(): number {
    return this.forceRequirements.filter((requirement) => !requirement.met && requirement.warning)
      .length;
  }

  /**
   * One line for the whole drawing.
   *
   * Counted rather than listed, because the list is right underneath it.
   */
  get title(): string {
    return this.mode() === 'force' ? 'Force analysis setup' : 'Analysis setup';
  }

  get summary(): string {
    if (this.mode() === 'force') {
      const blockers = this.forceOutstanding;
      const warnings = this.forceWarnings;
      if (blockers > 0) {
        const blockerText = blockers === 1 ? 'One blocker' : `${blockers} blockers`;
        return warnings > 0
          ? `${blockerText}, ${warnings === 1 ? 'one thing' : `${warnings} things`} worth a look.`
          : `${blockerText} before forces can be solved.`;
      }
      return warnings > 0
        ? `Force analysis runs. ${warnings === 1 ? 'One thing below is' : `${warnings} things below are`} worth a look before trusting the numbers.`
        : 'Force analysis is ready to run.';
    }
    const all = this.readiness;
    if (all.length === 0) {
      return this.unassigned.length > 0
        ? 'Nothing here is a mechanism yet. A chain has to reach ground before it has a position to solve for.'
        : 'Draw a linkage to analyse it.';
    }
    const blockers = this.mechanism.blockerCount();
    if (blockers > 0) {
      return `${blockers} ${blockers === 1 ? 'thing has' : 'things have'} to change before ${
        all.length === 1 ? 'this mechanism' : 'every mechanism'
      } will run.`;
    }
    const warnings = all.reduce(
      (n, r) => n + r.checks.filter((c) => c.state === 'warning').length,
      0
    );
    if (warnings > 0) {
      return `Everything runs. ${warnings === 1 ? 'One result is' : `${warnings} results are`} worth a look before trusting the numbers.`;
    }
    return all.length === 1
      ? 'Ready to animate.'
      : `All ${all.length} mechanisms are ready to animate.`;
  }

  isOpen(readiness: MechanismReadiness): boolean {
    // Open when something is wrong, closed when nothing is — so a drawing that
    // is fine collapses to a list of names. What a mechanism *is* lives in its
    // own panel now; this drawer carries only what is in the way.
    return this.collapsed.has(readiness.id) ? false : readiness.checks.length > 0;
  }

  toggle(readiness: MechanismReadiness): void {
    if (readiness.checks.length === 0) {
      return;
    }
    if (this.isOpen(readiness)) {
      this.collapsed.add(readiness.id);
    } else {
      this.collapsed.delete(readiness.id);
    }
  }

  chipFor(readiness: MechanismReadiness): { text: string; kind: 'blocker' | 'warning' | 'ok' } {
    const blockers = readiness.checks.filter((c) => c.state === 'blocker').length;
    if (blockers > 0) {
      return { text: `${blockers} ${blockers === 1 ? 'blocker' : 'blockers'}`, kind: 'blocker' };
    }
    const warnings = readiness.checks.length;
    if (warnings > 0) {
      return { text: `${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`, kind: 'warning' };
    }
    return { text: 'Ready', kind: 'ok' };
  }

  /**
   * Select the whole machine this section is about.
   *
   * The way to a mechanism's own panel in *either* mode: the transport chip
   * only exists while analysing, and Edit needs a route too.
   */
  select(index: number, event: Event): void {
    event.stopPropagation();
    this.activeObj.selectMechanism(index);
  }

  iconFor(check: ReadinessCheck): string {
    return check.state === 'blocker' ? 'error_outline' : 'warning_amber';
  }

  /**
   * Every body force analysis will weigh, one editable row each.
   *
   * Setting up an analysis is mostly this: eight links, eight masses, and a
   * panel that needs eight selections to reach them. The table is the same
   * numbers in one place — and the place the massless warning points at.
   * Cylinder parts appear under the part's own name, which is the first home
   * their masses have had.
   */
  /**
   * The table's fields are the app's own input component, driven through this
   * form — one control per cell, named by body — so focus, fill, underline
   * and blur-commit are literally the same code path as every other field.
   * Values refresh on mechanism updates, never per change-detection pass,
   * so a half-typed entry is never stomped.
   */
  tableForm = new FormGroup({}, { updateOn: 'blur' });
  private tableSubscriptions = new Map<string, Subscription>();
  private tableRefresh?: Subscription;

  ngOnInit(): void {
    this.tableRefresh = this.mechanism.onMechUpdateState.subscribe(() =>
      this.refreshTableValues()
    );
  }

  ngOnDestroy(): void {
    this.tableRefresh?.unsubscribe();
    this.tableSubscriptions.forEach((subscription) => subscription.unsubscribe());
  }

  massControlName(row: MassRow): string {
    return 'm_' + row.body.id;
  }

  moiControlName(row: MassRow): string {
    return 'i_' + row.body.id;
  }

  private ensureRowControls(rows: MassRow[]): void {
    const wanted = new Set<string>();
    for (const row of rows) {
      for (const [name, kind] of [
        [this.massControlName(row), 'mass'],
        [this.moiControlName(row), 'moi'],
      ] as const) {
        wanted.add(name);
        if (!this.tableForm.contains(name)) {
          const control = new FormControl(
            kind === 'mass' ? this.massText(row) : this.moiText(row)
          );
          this.tableForm.addControl(name, control, { emitEvent: false });
          this.tableSubscriptions.set(
            name,
            control.valueChanges.subscribe((raw) => this.commitCell(row.body.id, kind, raw ?? ''))
          );
        }
        const control = this.tableForm.get(name)!;
        const editable =
          this.massEditable() && (kind === 'mass' || this.moiEditable(row));
        if (editable && control.disabled) control.enable({ emitEvent: false });
        if (!editable && control.enabled) control.disable({ emitEvent: false });
      }
    }
    for (const [name, subscription] of [...this.tableSubscriptions]) {
      if (!wanted.has(name)) {
        subscription.unsubscribe();
        this.tableSubscriptions.delete(name);
        this.tableForm.removeControl(name as never, { emitEvent: false });
      }
    }
  }

  private refreshTableValues(): void {
    for (const row of this.currentRows()) {
      this.tableForm
        .get(this.massControlName(row))
        ?.setValue(this.massText(row), { emitEvent: false });
      this.tableForm
        .get(this.moiControlName(row))
        ?.setValue(this.moiText(row), { emitEvent: false });
    }
  }

  private commitCell(bodyId: string, kind: 'mass' | 'moi', raw: string): void {
    const row = this.currentRows().find((candidate) => candidate.body.id === bodyId);
    if (!row) return;
    if (kind === 'mass') this.applyMass(row, raw);
    else this.applyInertia(row, raw);
    this.refreshTableValues();
  }

  private currentRows(): MassRow[] {
    return this.buildRows();
  }

  massRows(): MassRow[] {
    const rows = this.buildRows();
    this.ensureRowControls(rows);
    return rows;
  }

  private buildRows(): MassRow[] {
    // The label logic lives with the mechanism, shared with the massless
    // warning — the table and the warning must call a body the same thing.
    return this.mechanism.links
      .filter((link) => link instanceof RealLink || link instanceof SliderBlock)
      .map((body) => ({
        body,
        label: this.mechanism.bodyLabel(body),
        isBlock: body instanceof SliderBlock,
      }));
  }

  massText(row: MassRow): string {
    // The unit is typed into the box, exactly as Basic Settings does it — and
    // typing it back (or not) parses the same either way.
    return this.nup.formatValueAndUnit(
      row.body.mass,
      this.nup.massUnitFor(this.settings.lengthUnit.value)
    );
  }

  moiText(row: MassRow): string {
    const length = this.settings.lengthUnit.value;
    const display = this.nup.displayInertiaUnit(length);
    if (row.isBlock || !(row.body instanceof RealLink)) {
      // A block is a point mass: its inertia is zero and stays a disabled
      // fact rather than a dash pretending the column does not apply.
      return this.nup.formatValueAndUnit(0, display);
    }
    return this.nup.formatValueAndUnit(
      this.nup.convertInertia(row.body.massMoI, this.nup.storedInertiaUnit(length), display),
      display
    );
  }

  moiIsAuto(row: MassRow): boolean {
    return row.body instanceof RealLink && !row.body.moiIsCustom;
  }

  /**
   * Whether this row's inertia can be typed at. A block is a point mass with
   * no inertia of its own, and a sealed cylinder's parts always follow their
   * own shapes — which is what lets the cylinder card promise exactly that.
   */
  moiEditable(row: MassRow): boolean {
    if (row.isBlock || !(row.body instanceof RealLink)) return false;
    if (!(row.body.mass > 0)) return false;
    return !this.mechanism.cylinderAt(row.body);
  }

  massUnitLabel(): string {
    return this.nup.unitLabel(this.nup.massUnitFor(this.settings.lengthUnit.value));
  }

  inertiaUnitLabel(): string {
    return this.nup.unitLabel(this.nup.displayInertiaUnit(this.settings.lengthUnit.value));
  }

  /**
   * Editing is an Edit-mode thing, as everywhere else in the app: the
   * analysis modes read a solved cycle and hold it still. The header offers
   * the mode switch, so the read-only state is one click from the editable
   * one — with the drawer staying open across it.
   */
  massEditable(): boolean {
    return this.tabs.getCurrentTab() === TabID.EDIT && !this.mechanism.isPlaying;
  }

  inEditMode(): boolean {
    return this.tabs.getCurrentTab() === TabID.EDIT;
  }

  anyBodyIsCustom(): boolean {
    return this.mechanism.links.some(
      (link) => link instanceof RealLink && (link.moiIsCustom || link.comIsCustom)
    );
  }

  resetAllBodies(): void {
    if (!this.massEditable()) return;
    for (const link of this.mechanism.links) {
      if (link instanceof RealLink) {
        link.moiIsCustom = false;
        link.comIsCustom = false;
        link.comOffset = undefined;
      }
    }
    this.mechanism.updateMechanism(true);
    this.mechanism.onMechUpdateState.next(2);
  }

  /**
   * Turn gravity back on from here, rather than sending the reader to Settings.
   *
   * The same edit the settings toggle makes, by the same three steps: gravity
   * changes what a force analysis means, so the mechanisms are rebuilt, the
   * change is undoable, and an open force graph is asked to redraw.
   */
  turnGravityOn(): void {
    if (!this.massEditable() || this.settings.isGravity.value) return;
    this.settings.isGravity.next(true);
    this.mechanism.updateMechanism(true);
    this.mechanism.onMechUpdateState.next(2);
  }

  private applyMass(row: MassRow, raw: string): void {
    if (!this.massEditable()) return;
    const [success, value] = this.nup.parseMassString(
      raw,
      this.nup.massUnitFor(this.settings.lengthUnit.value)
    );
    if (!success || value < 0) {
      this.notify.refusal('value.mass', NOT_A.mass);
      return;
    }
    this.mechanism.assignBodyMass(row.body, value);
    this.mechanism.updateMechanism(true);
    this.mechanism.onMechUpdateState.next(2);
  }

  private applyInertia(row: MassRow, raw: string): void {
    if (!this.massEditable() || !this.moiEditable(row) || !(row.body instanceof RealLink)) return;
    const length = this.settings.lengthUnit.value;
    const display = this.nup.displayInertiaUnit(length);
    const [success, value] = this.nup.parseInertiaString(raw, display);
    if (!success || value < 0) {
      this.notify.refusal('value.inertia', NOT_A.momentOfInertia);
      return;
    }
    row.body.massMoI = this.nup.convertInertia(value, display, this.nup.storedInertiaUnit(length));
    row.body.moiIsCustom = true;
    this.mechanism.updateMechanism(true);
    this.mechanism.onMechUpdateState.next(2);
  }

  /**
   * Go to the part a check is about: select it, and switch to the mode where it
   * can be changed.
   *
   * Deliberately not an undo step. Being shown where a problem is has not
   * changed the mechanism, and pressing Undo afterwards should take back the
   * last edit rather than the last time the reader looked at something.
   */
  goTo(part: Joint | Link | undefined): void {
    if (!part) return;
    this.tabs.setTab(TabID.EDIT);
    if (part instanceof RealJoint || part instanceof RealLink) {
      this.activeObj.updateSelectedObj(part);
    }
    // The arrow next to a mass cell points at the mass fields, so land on
    // them even when the reader last left that section folded shut.
    if (part instanceof RealLink && EditPanelComponent.instance) {
      EditPanelComponent.instance.sectionExpanded['LMass'] = true;
    }
  }

  nameOf(part: Joint | Link | undefined): string {
    if (!part) return '';
    return (part as RealJoint).name || part.id;
  }
}
