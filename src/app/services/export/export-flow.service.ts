import { Injectable, inject } from '@angular/core';
import { ForceAnalysisMode } from '../../model/mechanism/force-solver';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { MechanismService } from '../mechanism.service';
import { ActiveObjService } from '../active-obj.service';
import { SettingsService } from '../settings.service';
import { ExportCatalogService } from './export-catalog.service';
import { ExportColumnsService } from './export-columns.service';
import {
  ColumnTab,
  Decimals,
  ExportColumn,
  ExportColumnGroup,
  ExportFormat,
  ExportPart,
  ExportPartGroup,
} from './export-model';

/** Which of the three questions the drawer is asking. */
/**
 * Which of the questions the drawer is asking.
 *
 * Named rather than numbered, because how many there are depends on the
 * drawing: a mechanism with no force analysis set up is asked three questions
 * and one with is asked four. A number would have to mean a different question
 * in each case.
 */
export type ExportStep = 'parts' | 'kinematics' | 'forces' | 'file';

/**
 * What the export drawer has been told so far.
 *
 * Three steps, each asking one question: which parts, which numbers, and how
 * the file should be written. Nothing here writes anything — `ExportWriter`
 * turns this state into files — and nothing here touches the mechanism, so
 * opening the drawer and changing every answer in it leaves the drawing alone.
 */
@Injectable({ providedIn: 'root' })
export class ExportFlowService {
  private catalog = inject(ExportCatalogService);
  private activeObj = inject(ActiveObjService);
  private columns = inject(ExportColumnsService);
  private mechanism = inject(MechanismService);
  private settings = inject(SettingsService);
  private tabs = inject(SelectedTabService);

  step: ExportStep = 'parts';
  format: ExportFormat = 'csv';
  decimals: Decimals = 6;
  /** One file for everything that can share a time column, or one per part. */
  splitPerPart = false;
  /** Whether a two-component series also writes its magnitude. */
  withMagnitude = true;
  /** Which kind of picture the Graph images format writes. */
  imageFormat: 'png' | 'svg' = 'png';
  /** Empty until the reader types: the name shown is derived while it is. */
  typedName = '';

  private pickedParts = new Set<string>();
  private pickedColumns = new Set<string>();
  private touchedColumns = false;

  /**
   * What this drawing has to offer, held between changes to the drawing.
   *
   * The lists come from the readiness report and the force solver, and the
   * template asks for them a dozen times a frame — without this, moving the
   * mouse over the drawer re-solves the whole drawing. Held against a
   * fingerprint rather than a notification, so a rebuild that never published
   * one cannot leave a stale list on screen.
   */
  private cached?: { key: string; groups: ExportPartGroup[]; forces: boolean };

  /**
   * What the lists are of, cheaply enough to check on every question.
   *
   * A subscription to the mechanism's update subject is not enough on its own:
   * not every path that changes a drawing publishes on it, and a drawer showing
   * parts of a mechanism that has since stopped solving is worse than a drawer
   * that rebuilds a list too often. Nothing here samples or solves — it is
   * lengths, ids and flags the mechanism already holds.
   */
  private fingerprint(): string {
    return [
      this.mechanism.joints.length,
      this.mechanism.links.length,
      this.mechanism.partitions.map((partition) => partition.id).join(','),
      this.mechanism.mechanisms.map((solved) => (solved.isMechanismValid() ? 1 : 0)).join(''),
      this.settings.forceAnalysisMode.value,
      // What the canvas is holding, because a row says so. Rebuilt on a change
      // of selection rather than left as it was when the drawer opened, which
      // is how a row went on claiming to be the selected one after the reader
      // had picked something else.
      this.activeObj.objType,
      this.activeObj.selectedJoint?.id,
      this.activeObj.selectedLink?.id,
      // Units ride the column heads, so a change of them is a change of list.
      this.settings.lengthUnit.value,
      this.settings.angleUnit.value,
      this.settings.forceUnit.value,
      // Bumped by every rebuild of the solved cycle, which is how a change
      // that leaves the counts alone still invalidates this. Deliberately not
      // the pose, which playback moves every frame.
      this.mechanism.solveRevision,
      this.stamp,
    ].join('|');
  }

  /** Bumped by `refresh()`, so an explicit ask always rebuilds. */
  private stamp = 0;

  private build(): { key: string; groups: ExportPartGroup[]; forces: boolean } {
    const withForces = this.catalog.partGroups(true);
    const forces = withForces.some((group) => group.forcesReady && group.parts.length > 0);
    return {
      key: this.fingerprint(),
      groups: forces ? withForces : this.catalog.partGroups(false),
      forces,
    };
  }

  private lists(): { key: string; groups: ExportPartGroup[]; forces: boolean } {
    const key = this.fingerprint();
    if (this.cached?.key !== key) this.cached = this.build();
    return this.cached;
  }

  /** Forget the lists, so the next question rebuilds them. */
  refresh(): void {
    this.stamp++;
    this.cached = undefined;
  }

  /** Start again at the parts, ticking whatever is selected on the grid. */
  reset(): void {
    this.refresh();
    this.step = 'parts';
    this.typedName = '';
    this.touchedColumns = false;
    this.pickedColumns.clear();
    this.pickedParts = new Set(
      this.partGroups()
        .flatMap((group) => group.parts)
        .filter((part) => part.available && part.note.includes('currently selected'))
        .map((part) => part.key)
    );
  }

  // --- step 1: parts --------------------------------------------------------

  partGroups(): ExportPartGroup[] {
    return this.lists().groups;
  }

  isPicked(part: ExportPart): boolean {
    return this.pickedParts.has(part.key);
  }

  togglePart(part: ExportPart): void {
    if (!part.available) return;
    if (!this.pickedParts.delete(part.key)) this.pickedParts.add(part.key);
    this.touchedColumns = false;
  }

  setParts(parts: ExportPart[], picked: boolean): void {
    parts
      .filter((part) => part.available)
      .forEach((part) => {
        if (picked) this.pickedParts.add(part.key);
        else this.pickedParts.delete(part.key);
      });
    this.touchedColumns = false;
  }

  /**
   * What is ticked *and* still has something to give.
   *
   * A mechanism can stop solving while the drawer is open — an undo, a reload,
   * a machine that loses its input — and a tick left over from before is a
   * promise of numbers that no longer exist. Kept in `pickedParts` rather than
   * struck out, so a mechanism that comes back brings its selection with it.
   */
  selectedParts(): ExportPart[] {
    return this.catalog
      .partsOf(this.partGroups(), this.pickedParts)
      .filter((part) => part.available);
  }

  offeredParts(): ExportPart[] {
    return this.partGroups()
      .flatMap((group) => group.parts)
      .filter((part) => part.available);
  }

  // --- the questions, and moving between them -------------------------------

  /**
   * The questions this drawing is asked, in order.
   *
   * Forces are a question of their own rather than a tab inside the columns:
   * they are a different analysis of the same cycle, not a second way of
   * looking at one — and a drawing with no force analysis set up is never asked
   * about them at all.
   */
  steps(): ExportStep[] {
    return this.forcesAvailable()
      ? ['parts', 'kinematics', 'forces', 'file']
      : ['parts', 'kinematics', 'file'];
  }

  /** Which of them is showing, counted from one for the rule across the top. */
  stepNumber(step: ExportStep = this.step): number {
    return this.steps().indexOf(step) + 1;
  }

  /** Whether a step has already been answered, and so can be gone back to. */
  isBehind(step: ExportStep): boolean {
    return this.stepNumber(step) < this.stepNumber();
  }

  goTo(step: ExportStep): void {
    if (this.steps().includes(step)) this.step = step;
  }

  /** Which way each of Back and Next leads from here. */
  private neighbour(by: 1 | -1): ExportStep | undefined {
    const order = this.steps();
    return order[order.indexOf(this.step) + by];
  }

  nextStep(): ExportStep | undefined {
    return this.neighbour(1);
  }

  previousStep(): ExportStep | undefined {
    return this.neighbour(-1);
  }

  // --- the column steps -----------------------------------------------------

  /** Force columns are only worth a step where a force analysis actually solves. */
  forcesAvailable(): boolean {
    return this.lists().forces;
  }

  /** Which columns the step being shown is about. */
  get tab(): ColumnTab {
    return this.step === 'forces' ? 'forces' : 'kinematics';
  }

  columnGroups(tab: ColumnTab = this.tab): ExportColumnGroup[] {
    return this.columns.columnGroups(this.selectedParts(), tab);
  }

  allColumns(): ExportColumn[] {
    const kinematic = this.columnGroups('kinematics').flatMap((group) => group.columns);
    const force = this.forcesAvailable()
      ? this.columnGroups('forces').flatMap((group) => group.columns)
      : [];
    return [...kinematic, ...force];
  }

  /**
   * What is ticked, defaulting to everything a reader usually wants.
   *
   * Centre of mass is the one thing left off: it is three more series per link
   * about a point most drawings never move, and a file is easier to widen than
   * to explain.
   */
  private defaults(): Set<string> {
    return new Set(
      this.allColumns()
        .filter((column) => column.key !== 'l:com')
        .map((column) => column.key)
    );
  }

  private current(): Set<string> {
    if (!this.touchedColumns) {
      this.pickedColumns = this.defaults();
      this.touchedColumns = true;
    }
    return this.pickedColumns;
  }

  isColumnPicked(column: ExportColumn): boolean {
    return this.current().has(column.key);
  }

  toggleColumn(column: ExportColumn): void {
    const picked = this.current();
    if (!picked.delete(column.key)) picked.add(column.key);
  }

  setColumns(columns: ExportColumn[], picked: boolean): void {
    const current = this.current();
    columns.forEach((column) => (picked ? current.add(column.key) : current.delete(column.key)));
  }

  selectedColumns(tab?: ColumnTab): ExportColumn[] {
    const picked = this.current();
    return this.allColumns().filter(
      (column) => picked.has(column.key) && (!tab || column.tab === tab)
    );
  }

  columnCount(tab: ColumnTab): number {
    return this.selectedColumns(tab).length;
  }

  forceMode(): ForceAnalysisMode {
    return this.settings.forceAnalysisMode.value;
  }

  setForceMode(mode: ForceAnalysisMode): void {
    this.settings.forceAnalysisMode.next(mode);
    this.refresh();
    this.touchedColumns = false;
  }

  // --- step 3: the file -----------------------------------------------------

  /** Which machines the chosen parts come from, in drawing order. */
  mechanismIndexes(): number[] {
    return [...new Set(this.selectedParts().map((part) => part.mechanismIndex))].sort(
      (a, b) => a - b
    );
  }

  /** The stem the files are named from, until the reader types their own. */
  defaultName(): string {
    const groups = this.partGroups();
    const first = this.mechanismIndexes()[0];
    const id = first === undefined ? 'mechanism' : (groups[first]?.id ?? 'mechanism');
    const forces = this.selectedColumns('forces').length > 0;
    return `${id}_${forces ? 'analysis' : 'kinematics'}`;
  }

  name(): string {
    return this.typedName.trim() || this.defaultName();
  }

  extension(): string {
    switch (this.format) {
      case 'xlsx':
        return '.xlsx';
      case 'images':
        return `.${this.imageFormat}`;
      case 'report':
        return '.pdf';
      default:
        return '.csv';
    }
  }

  canExport(): boolean {
    return this.selectedParts().length > 0 && this.selectedColumns().length > 0;
  }
}
