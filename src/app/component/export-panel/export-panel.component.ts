import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { ScrollShadowDirective } from '../../scroll-shadow.directive';
import { MechanismService } from '../../services/mechanism.service';
import { Joint } from '../../model/joint';
import { Link } from '../../model/link';
import { NotificationService } from '../../services/notification.service';
import { AnalyticsService } from '../../services/analytics.service';
import { ExportFlowService, ExportStep } from '../../services/export/export-flow.service';
import { ExportWriterService } from '../../services/export/export-writer.service';
import {
  Decimals,
  ExportColumn,
  ExportFormat,
  ExportPart,
  ExportPartGroup,
} from '../../services/export/export-model';
import { RightPanelComponent } from '../right-panel/right-panel.component';

/** One of the questions, as the rule across the top draws it. */
interface StepMark {
  step: ExportStep;
  number: number;
  name: string;
}

/**
 * Export Data, asked one question at a time.
 *
 * The old command wrote whatever the analysis panel happened to be showing for
 * whatever was selected: one part, every graph of it, always a CSV. Everything
 * else in the drawing — the other joints, the second mechanism, the forces —
 * was unreachable. This asks the three questions that were never asked: which
 * parts, which numbers, and how the file should be written.
 */
@Component({
  selector: 'app-export-panel',
  templateUrl: './export-panel.component.html',
  styleUrls: ['./export-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon, MatTooltip, ScrollShadowDirective],
})
export class ExportPanelComponent implements OnInit, OnDestroy {
  flow = inject(ExportFlowService);
  private writer = inject(ExportWriterService);
  private mechanism = inject(MechanismService);
  private notify = inject(NotificationService);
  private analytics = inject(AnalyticsService);

  /** The names the rule across the top puts on this drawing's questions. */
  private readonly stepNames: Record<ExportStep, string> = {
    parts: 'Parts',
    kinematics: 'Kinematics',
    forces: 'Forces',
    file: 'File',
  };

  get steps(): StepMark[] {
    return this.flow.steps().map((step, at) => ({
      step,
      number: at + 1,
      name: this.stepNames[step],
    }));
  }

  /**
   * The four ways out, each with the line that says what it is for.
   *
   * A sentence apiece rather than a mark to press: there are only four, they
   * are read together while choosing between them, and a tooltip that has to
   * be hunted for four times is a worse way to compare them than four lines
   * already on the page.
   */
  readonly formats: { key: ExportFormat; name: string; note: string }[] = [
    {
      key: 'csv',
      name: 'CSV',
      note: 'One time column, one per series.',
    },
    {
      key: 'xlsx',
      name: 'Excel workbook',
      note: 'Sheets by analysis or by part, for charting.',
    },
    {
      key: 'images',
      name: 'Graph images',
      note: 'PNG or SVG per graph.',
    },
    {
      key: 'report',
      name: 'Report (PDF)',
      note: 'The mechanism, the graphs and the table.',
    },
  ];

  readonly decimalChoices: Decimals[] = [2, 4, 6, 'full'];

  /**
   * What each of the file step's settings does, in the panel's own help mark.
   *
   * Beside the control rather than under it: four paragraphs stacked down a
   * 380px drawer is a page nobody reads to answer a question they have about
   * one row of it.
   */
  readonly help: Record<string, string> = {
    decimals:
      'How many digits after the point every number keeps. Full writes what the solver produced, which is what to choose if the rounding is going to happen somewhere else.',
    files:
      'One file holds every chosen part of a machine against one time column. Per part writes a file for each, which is easier to chart one at a time and harder to compare across. Either way a machine gets its own file, because two machines run on two clocks.',
    sheets:
      'By analysis puts kinematics and forces on sheets of their own, so one can be charted without the other’s axis running through it. By part gives every chosen joint and link a sheet.',
    images:
      'SVG stays sharp at any size and can be opened and edited; PNG drops into a document that will not take a vector. Both carry the PMKS+ mark.',
    name: 'The stem every file is named from. Where the export writes more than one, what tells them apart is added to it.',
    analysis:
      'Static solves the mechanism held still at each position, which is the equilibrium a hand calculation gives. In-motion adds the inertia of the moving parts, so a fast machine reads differently from a slow one.',
    components:
      'X and Y are the components along the axes. Magnitude is √(X² + Y²) — the size of the vector, without its direction — and only a series that has two components has one to add.',
  };

  /**
   * Which glyph says what is about to come down: one file, a few, or a folder.
   *
   * Ligatures from the classic Material set the app already loads. A name the
   * font does not know renders as the name itself in a box, which is worse
   * than no glyph at all.
   */
  get deliveryGlyph(): string {
    if (this.flow.format === 'report') return 'print';
    if (this.flow.format === 'xlsx') return 'grid_on';
    const count = this.flow.format === 'images' ? this.pictureCount() : this.writer.summary().files;
    if (count > 2) return 'folder';
    return count > 1 ? 'content_copy' : 'insert_drive_file';
  }

  get deliveryNote(): string {
    if (this.flow.format === 'report') return 'Opens the print dialog, where Save as PDF writes it';
    const count = this.flow.format === 'images' ? this.pictureCount() : this.writer.summary().files;
    if (count > 2) return `${count} files, in one zip folder`;
    if (count > 1) return `${count} files`;
    return this.flow.format === 'xlsx' ? 'One workbook' : 'One file';
  }

  /** Set while the browser is drawing pictures, which is not instant. */
  working = false;

  private updates?: Subscription;

  ngOnInit(): void {
    this.flow.reset();
    this.updates = this.mechanism.onMechUpdateState.subscribe(() => this.flow.refresh());
  }

  ngOnDestroy(): void {
    this.updates?.unsubscribe();
    // Nothing on the canvas should stay lit once the list that lit it is gone.
    this.mechanism.hoveredPart = undefined;
  }

  // --- what the head says ---------------------------------------------------

  get lead(): string {
    if (this.flow.step === 'parts') return 'Which parts do you want numbers for?';
    if (this.flow.step === 'file') return 'How should the file be written?';
    const names = this.flow.selectedParts().map((part) => part.label.replace(/^(Joint|Link) /, ''));
    if (names.length === 0) return 'Nothing is selected yet.';
    return this.flow.step === 'forces'
      ? `Which forces for ${list(names)}?`
      : `Which motion for ${list(names)}?`;
  }

  get countText(): string {
    if (this.flow.step === 'parts') {
      return `${this.flow.selectedParts().length} of ${this.flow.offeredParts().length} parts`;
    }
    const tab = this.flow.tab;
    const of = this.flow.columnGroups(tab).flatMap((group) => group.columns).length;
    const picked = this.flow.columnCount(tab);
    return tab === 'forces' ? `${picked} of ${of} force columns` : `${picked} of ${of} columns`;
  }

  get footNote(): string {
    if (this.flow.step === 'parts') {
      const parts = this.flow.selectedParts().length;
      const machines = this.flow
        .mechanismIndexes()
        .map((index) => this.flow.partGroups()[index]?.id)
        .filter(Boolean)
        .join(', ');
      return parts === 0
        ? 'Nothing chosen yet'
        : `${parts} ${parts === 1 ? 'part' : 'parts'}${machines ? ' · ' + machines : ''}`;
    }
    if (this.flow.step === 'file') return '';
    const summary = this.writer.summary();
    return `${Math.max(summary.columns - 1, 0)} columns · ${summary.rows} rows`;
  }

  // --- step 1 ---------------------------------------------------------------

  groups(): ExportPartGroup[] {
    return this.flow.partGroups().filter((group) => group.parts.length > 0);
  }

  pickedIn(group: ExportPartGroup): number {
    return group.parts.filter((part) => this.flow.isPicked(part)).length;
  }

  groupNote(group: ExportPartGroup): string {
    const picked = this.pickedIn(group);
    return picked > 0 ? `${group.note} · ${picked} selected` : group.note;
  }

  /**
   * Point at the part this row is about, on the canvas.
   *
   * A name is not a place: `Joint F` on a Jansen leg is one of eleven pins and
   * the list says nothing about which. The grid defers to whatever is already
   * selected there, so this can never take a reader's own mark away.
   */
  pointAt(part: ExportPart | undefined): void {
    this.mechanism.hoveredPart = part?.part;
  }

  /**
   * Whether this row is the thing the reader has picked on the canvas.
   *
   * Asked of the mechanism rather than read off the selection's fields: the
   * type has to be right (letting go of a part leaves the old one remembered)
   * and a sealed cylinder has to answer for whichever of its pieces was hit.
   */
  isOnGrid(part: ExportPart): boolean {
    return part.kind === 'joint'
      ? this.mechanism.isSelectedJoint(part.part as Joint)
      : this.mechanism.isSelectedBody(part.part as Link);
  }

  everything(picked: boolean): void {
    this.flow.setParts(this.flow.offeredParts(), picked);
  }

  // --- the column steps -----------------------------------------------------

  allColumnsOnTab(): ExportColumn[] {
    return this.flow.columnGroups(this.flow.tab).flatMap((group) => group.columns);
  }

  everyColumn(picked: boolean): void {
    this.flow.setColumns(this.allColumnsOnTab(), picked);
  }

  /**
   * What one ticked row will actually write, said on the row itself.
   *
   * The components control underneath used to be the only statement of it,
   * which left a reader to work out for themselves that it governs a rate and a
   * reaction but has nothing to add to an angle or a position.
   */
  componentsOf(column: ExportColumn): string {
    const widest = column.series.reduce((most, series) => Math.max(most, series.components), 1);
    if (widest < 2) return '';
    return widest === 2 || !this.flow.withMagnitude ? 'X, Y' : 'X, Y, Mag';
  }

  /** Whether anything on offer has a magnitude, and so anything to choose. */
  hasMagnitude(): boolean {
    return this.allColumnsOnTab().some((column) =>
      column.series.some((series) => series.components === 3)
    );
  }

  // --- step 3 ---------------------------------------------------------------

  get summaryLine(): string {
    const summary = this.writer.summary();
    if (this.flow.format === 'images') {
      const pictures = this.pictureCount();
      return `${pictures} ${pictures === 1 ? 'image' : 'images'} · ${this.flow.imageFormat.toUpperCase()}`;
    }
    if (this.flow.format === 'report') {
      return `${Math.max(summary.columns - 1, 0)} columns · ${summary.rows} rows · ${
        summary.pages
      } printed ${summary.pages === 1 ? 'page' : 'pages'}`;
    }
    // How many files there are is the line under this one, in the glyph's own
    // words; saying it twice made a two-line card read as a paragraph.
    return `${Math.max(summary.columns - 1, 0)} columns · ${summary.rows} rows`;
  }

  private pictureCount(): number {
    return this.flow
      .selectedColumns()
      .reduce((total, column) => total + column.appliesTo.length * column.series.length, 0);
  }

  get fileName(): string {
    return this.flow.name();
  }

  /**
   * What will actually land in the downloads folder.
   *
   * Asked of the writer, which is what names it: the name field says `.csv`
   * because that is what the files inside an archive are, and a card promising
   * `M1_analysis.csv` while `M1_analysis.zip` arrives is the card being wrong
   * about the one thing it is there to say.
   */
  get arrivingName(): string {
    return this.writer.arrivingName();
  }

  onName(event: Event): void {
    this.flow.typedName = (event.target as HTMLInputElement).value;
  }

  decimalLabel(choice: Decimals): string {
    return choice === 'full' ? 'Full' : String(choice);
  }

  // --- moving between the steps --------------------------------------------

  /**
   * Whether Next leads anywhere from here.
   *
   * A column step never blocks: a reader who wants forces alone passes through
   * the kinematics without ticking anything, and the file step is where having
   * chosen nothing at all is finally in the way.
   */
  canGoOn(): boolean {
    if (this.flow.step === 'parts') return this.flow.selectedParts().length > 0;
    if (this.flow.step === 'file') return this.flow.canExport();
    return true;
  }

  next(): void {
    if (!this.canGoOn()) return;
    const onward = this.flow.nextStep();
    if (!onward) {
      void this.exportNow();
      return;
    }
    this.flow.goTo(onward);
  }

  back(): void {
    const behind = this.flow.previousStep();
    if (behind) this.flow.goTo(behind);
  }

  /** A question already answered is the way back to it; one not reached is not. */
  goTo(step: ExportStep): void {
    if (this.flow.isBehind(step)) this.flow.goTo(step);
  }

  async exportNow(): Promise<void> {
    if (!this.flow.canExport() || this.working) return;
    this.working = true;
    // Let the button paint its spinner before the work starts. Sampling a
    // cycle for eighty series holds the main thread, and a press that showed
    // nothing until it finished read as a press that had not registered.
    await new Promise((resolve) => setTimeout(resolve, 32));
    this.analytics.logEvent(`export_data_${this.flow.format}`);
    // Read before the work starts, for the same reason the writer snapshots its
    // own settings: the message has to name the file that was actually written.
    const arriving = this.arrivingName;
    try {
      const written = await this.writer.run();
      if (!written) {
        this.notify.refusal(
          'export.empty',
          'Nothing was written: the parts that were ticked no longer have numbers to give.'
        );
        return;
      }
      this.notify.success(
        'export.done',
        this.flow.format === 'report'
          ? 'The report is ready to print or save as PDF.'
          : `${arriving} is on its way.`
      );
    } catch {
      this.notify.failure('export.failed', 'The export could not be written.');
    } finally {
      this.working = false;
    }
  }

  close(): void {
    RightPanelComponent.isOpen = false;
  }

  isPicked = (part: ExportPart): boolean => this.flow.isPicked(part);
}

/** `B`, `B and C`, `B, C and AB` — a list read the way it is spoken. */
function list(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
