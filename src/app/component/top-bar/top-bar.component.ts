import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
  inject,
  isDevMode,
  viewChild,
} from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import { MatDialog } from '@angular/material/dialog';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { MechanismService } from '../../services/mechanism.service';
import { SaveHistoryService } from '../../services/save-history.service';
import { AnalyticsService } from '../../services/analytics.service';
import { UrlGenerationService } from '../../services/url-generation.service';
import { UrlProcessorService } from '../../services/url-processor.service';
import { RightPanelComponent } from '../right-panel/right-panel.component';
import { ExportFlowService } from '../../services/export/export-flow.service';
import { TemplatesComponent } from '../MODALS/templates/templates.component';
import { NotificationService } from '../../services/notification.service';
import { TutorialService } from '../../services/tutorial.service';
import { MatTooltip } from '@angular/material/tooltip';
import { MatIcon } from '@angular/material/icon';
import { KeyboardShortcutsService, ShortcutId } from '../../services/keyboard-shortcuts.service';

/** A mode's chip: whether that analysis can be entered, and what is missing. */
interface TabStatus {
  text: string;
  ready: boolean;
}

/**
 * The strip across the top: what may be done to the mechanism, and whether it
 * is ready to be analysed.
 *
 * It replaces a horizontal file toolbar and a vertical mode rail which between
 * them took a whole edge and corner of the window. Opening and saving is not
 * what anyone is doing most of the time, so it folds into one menu and the
 * modes take the space instead.
 *
 * Both analysis tabs stay pressable even when they cannot be entered. A greyed
 * tab provokes exactly the question "why not?" and is the one control unable to
 * answer it; pressing these opens the setup list, which is the answer.
 */
@Component({
  selector: 'app-top-bar',
  templateUrl: './top-bar.component.html',
  styleUrls: ['./top-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  animations: [
    // Undo/Redo giving the corner over to Export Data, and back. The one on its
    // way out leaves the flow, so the card takes the width of the one arriving
    // instead of holding both.
    trigger('swapFace', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(7px)' }),
        animate('180ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'none' })),
      ]),
      transition(':leave', [
        style({ position: 'absolute', top: 0, right: '6px', bottom: 0 }),
        animate(
          '140ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({ opacity: 0, transform: 'translateY(-7px)' })
        ),
      ]),
    ]),
    // The same 200ms and easing the mode highlight slides on, so the menu and
    // everything else in this strip move as one piece of machinery.
    trigger('menuOpen', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-6px)' }),
        animate('200ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'none' })),
      ]),
      transition(':leave', [
        animate(
          '150ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({ opacity: 0, transform: 'translateY(-6px)' })
        ),
      ]),
    ]),
  ],
  imports: [MatTooltip, MatIcon],
})
export class TopBarComponent implements AfterViewInit, AfterViewChecked, OnDestroy {
  tabs = inject(SelectedTabService);
  mechanism = inject(MechanismService);
  private history = inject(SaveHistoryService);
  private urlGeneration = inject(UrlGenerationService);
  private urlProcessor = inject(UrlProcessorService);
  private dialog = inject(MatDialog);
  private zone = inject(NgZone);
  private changes = inject(ChangeDetectorRef);
  private exportFlow = inject(ExportFlowService);
  private notify = inject(NotificationService);
  private tutorial = inject(TutorialService);

  TabID = TabID;
  menuOpen = false;

  private analytics: AnalyticsService = inject(AnalyticsService);
  shortcuts = inject(KeyboardShortcutsService);

  readonly tabStrip = viewChild<ElementRef<HTMLElement>>('tabStrip');
  readonly strip = viewChild<ElementRef<HTMLElement>>('strip');

  /**
   * How much of each label the strip has room for: 2 full, 1 short, 0 icons.
   *
   * Measured rather than guessed at a width. Fixed breakpoints have to be set
   * for the widest the strip ever gets -- four modes, two status chips, both
   * spelled out -- so they throw words away long before the window has run out
   * of room for them. This asks the strip.
   */
  labelLevel = 3;
  /**
   * The room and the labels the current level was chosen for.
   *
   * Nothing else is remembered between fits. The natural widths depend on the
   * chips, the font and the layout being finished, and a set measured before
   * any of that settled says the strip is small enough for anything -- which
   * is how a phone came to show four full labels in a card a fifth of the
   * width they need.
   */
  private lastFit = '';

  isDevMode(): boolean {
    return isDevMode();
  }

  isActive(tab: TabID): boolean {
    return this.tabs.getCurrentTab() === tab && this.tabs.isTabVisible();
  }

  /**
   * Where the sliding highlight sits, measured off the active button.
   *
   * Measured rather than computed from an index because the tabs are different
   * widths, the divider takes space of its own, and the labels disappear on a
   * narrow window. Held as plain numbers and applied once per tab change: a
   * single CSS transition then eases the highlight across, so nothing runs per
   * frame that could stutter or strand it midway.
   *
   * Measured off a frame rather than read during change detection, because the
   * `active` class this looks for is applied by the same pass that would read
   * it back.
   */
  highlight = { left: 0, width: 0, visible: false };
  private pendingFrame = 0;
  private readonly onResize = () => this.scheduleHighlight();

  ngAfterViewInit(): void {
    this.scheduleHighlight();
    window.addEventListener('resize', this.onResize);
    document.fonts?.ready.then(() => {
      this.lastFit = '';
      this.zone.run(() => this.fitLabels());
    });
  }

  // After the pass, not during it: the `active` class this measures off is
  // written by the very pass that would read it back, so measuring inside one
  // reports where the highlight used to be and it trails a tab behind.
  ngAfterViewChecked(): void {
    this.watchCard();
    this.fitLabels();
    this.scheduleHighlight();
  }

  /**
   * Drop a level of label only once the level above will not fit.
   *
   * The three natural widths are measured once, by laying the strip out at each
   * level and reading what it wanted. After that it is arithmetic against the
   * space available, which is cheap enough to do on every checked pass.
   */
  private fitLabels(): void {
    const strip = this.strip()?.nativeElement;
    if (!strip || strip.clientWidth === 0) return;

    // Re-fit when the question changes, not on every pass: four class toggles
    // and four layout reads is cheap once and dear sixty times a second. The
    // chips are part of the question -- "Ready" is half of "3 to set".
    const question = [
      strip.clientWidth,
      this.statusOf(TabID.ANALYZE).text,
      this.statusOf(TabID.FORCE).text,
      this.tabs.getCurrentTab(),
    ].join('|');
    if (question === this.lastFit) return;
    this.lastFit = question;

    // What the strip wants at each level: its cards at their natural widths,
    // plus the gaps between them. Their laid-out widths would only tell us how
    // far they have already been squeezed.
    const gaps = 12 * Math.max(strip.children.length - 1, 0);
    const restore = strip.className;
    const wants = [0, 1, 2, 3].map((level) => {
      strip.classList.remove('fit0', 'fit1', 'fit2', 'fit3');
      strip.classList.add(`fit${level}`);
      return [...strip.children].reduce((total, card) => total + card.scrollWidth, 0) + gaps;
    });
    strip.className = restore;
    if (!(wants[3] > 0)) {
      // Nothing has been laid out yet. Ask again rather than remembering that.
      this.lastFit = '';
      return;
    }

    const level = wants.reduce(
      (best, want, at) => (want <= strip.clientWidth ? Math.max(best, at) : best),
      0
    );
    if (level !== this.labelLevel) {
      this.labelLevel = level;
      this.changes.detectChanges();
    }
  }

  /**
   * The keys that pick a mode go through `select`, exactly as the buttons do,
   * so a mode that is not ready opens its setup drawer rather than half
   * switching -- the gate is the mode's, not the button's.
   */
  private readonly keyed: Partial<Record<ShortcutId, () => void>> = {
    'mode.synthesis': () => this.select(TabID.SYNTHESIZE),
    'mode.edit': () => this.select(TabID.EDIT),
    'mode.kinematic': () => this.select(TabID.ANALYZE),
    'mode.force': () => this.select(TabID.FORCE),
    'app.settings': () => this.openSettings(),
    'app.help': () => this.openHelp(),
  };

  private keySub = this.shortcuts.pressed.subscribe((id) => this.keyed[id]?.());

  ngOnDestroy(): void {
    this.keySub.unsubscribe();
    if (this.pendingFrame) cancelAnimationFrame(this.pendingFrame);
    window.removeEventListener('resize', this.onResize);
    this.cardWatch?.disconnect();
  }

  private cardWatch?: ResizeObserver;

  /**
   * Watch the card, not just the window.
   *
   * The card can be squeezed without the window changing -- a chip growing, a
   * drawer opening beside it -- and a squeeze nothing asks a question about is
   * one the reader sees as clipped text.
   */
  private watchCard(): void {
    const card = this.strip()?.nativeElement;
    if (!card || this.cardWatch || typeof ResizeObserver === 'undefined') return;
    this.cardWatch = new ResizeObserver(() =>
      this.zone.run(() => {
        this.lastFit = '';
        this.fitLabels();
      })
    );
    this.cardWatch.observe(card);
  }

  private scheduleHighlight(): void {
    // Coalesce rather than restart. Cancelling the pending frame on every
    // checked pass means a busy app -- playback runs change detection every
    // frame -- cancels the measurement before it can ever run, and the
    // highlight sits on whichever tab was active last time things went quiet.
    if (this.pendingFrame) return;
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = 0;
      const active = this.tabStrip()?.nativeElement.querySelector<HTMLElement>('.tabButton.active');
      const next = active
        ? { left: active.offsetLeft, width: active.offsetWidth, visible: this.tabs.isTabVisible() }
        : { ...this.highlight, visible: false };
      // Only on a real change, so the measure-every-pass above settles instead
      // of asking for another pass forever.
      if (
        next.left === this.highlight.left &&
        next.width === this.highlight.width &&
        next.visible === this.highlight.visible
      ) {
        return;
      }
      // Back inside Angular to assign it. An animation frame runs outside, so
      // the new position would sit in the field unrendered until something else
      // happened to trigger a pass -- which is the next tab change, leaving the
      // highlight permanently one behind.
      this.zone.run(() => {
        this.highlight = next;
        // And re-check this view explicitly. The assignment happens after the
        // pass that would have rendered it, so without this the new position
        // waits for whatever causes the *next* pass -- which is the next tab
        // change, leaving the highlight permanently one behind.
        this.changes.detectChanges();
      });
    });
  }

  select(tab: TabID): void {
    this.menuOpen = false;
    if (this.tabs.isAnalysisMode(tab) && !this.canAnalyse(tab)) {
      // The setup for the mode that was pressed, not the other one's -- and
      // never a toggle: a reader pressing a mode that will not open is asking
      // why, and closing the answer is not one.
      RightPanelComponent.insistOn(
        tab === TabID.FORCE
          ? RightPanelComponent.FORCE_SETUP_TAB
          : RightPanelComponent.KINEMATIC_SETUP_TAB
      );
      return;
    }
    this.tabs.setTab(tab);
  }

  /** Kinematics needs one mechanism that runs. Force analysis needs more. */
  canAnalyse(tab: TabID): boolean {
    return tab === TabID.FORCE
      ? this.mechanism.forceAnalysisReady()
      : this.mechanism.oneValidMechanismExists();
  }

  /**
   * An empty grid has nothing to be ready for.
   *
   * "Ready" over a blank canvas is a promise about a mechanism that has not
   * been drawn: nothing is stopping analysis because there is nothing to
   * analyse.
   */
  hasStatus(): boolean {
    return this.mechanism.joints.length > 0 || this.mechanism.links.length > 0;
  }

  statusOf(tab: TabID): TabStatus {
    if (tab === TabID.FORCE) {
      // Warnings do not count: they do not stop the analysis running.
      const missing = this.mechanism
        .forceAnalysisRequirements()
        .filter((r) => !r.met && !r.warning).length;
      return missing === 0
        ? { text: 'Ready', ready: true }
        : { text: `${missing} to set`, ready: false };
    }
    const blockers = this.mechanism.blockerCount();
    return blockers === 0
      ? { text: 'Ready', ready: true }
      : { text: `${blockers} ${blockers === 1 ? 'fix' : 'fixes'}`, ready: false };
  }

  // Not while the mechanism is running: undo replays a URL, and replacing the
  // drawing underneath a playing animation is not something anyone asked for.
  canUndo(): boolean {
    return !this.mechanism.isAnimating() && this.history.canUndo();
  }

  canRedo(): boolean {
    return !this.mechanism.isAnimating() && this.history.canRedo();
  }

  /**
   * Whether there is anything to take away.
   *
   * A solved mechanism, rather than a selected part: the drawer offers every
   * part of every machine, so a reader who has selected nothing still has an
   * export to make -- which is exactly the case the old one-click command could
   * not serve.
   */
  canExport(): boolean {
    return this.mechanism.oneValidMechanismExists();
  }

  exportTooltip(): string {
    return this.canExport()
      ? 'Choose parts, columns and a file format'
      : 'Nothing has been solved yet, so there are no numbers to export';
  }

  exportData(): void {
    this.exportFlow.reset();
    RightPanelComponent.insistOn(RightPanelComponent.EXPORT_TAB);
  }

  undo(): void {
    this.history.undo();
  }

  redo(): void {
    this.history.redo();
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu(): void {
    this.menuOpen = false;
  }

  newProject(): void {
    this.closeMenu();
    this.analytics.logEvent('new_project');
    window.open(window.location.origin + window.location.pathname, '_blank');
  }

  openTemplates(): void {
    this.closeMenu();
    this.dialog.open(TemplatesComponent, { height: '90%', width: '90%', autoFocus: false });
  }

  openSettings(): void {
    this.closeMenu();
    RightPanelComponent.tabClicked(1);
  }

  openHelp(): void {
    this.closeMenu();
    RightPanelComponent.tabClicked(3);
  }

  /**
   * The way back to the tutorial once its offer has been dismissed for good.
   *
   * It opens at whichever step the drawing has not satisfied, so this works on
   * a mechanism already on the grid as well as on a bare one.
   */
  openTutorial(): void {
    this.closeMenu();
    this.tutorial.start();
  }

  openDebug(): void {
    this.closeMenu();
    RightPanelComponent.tabClicked(4);
  }

  /**
   * The chip opens that mode's setup, whether or not the mode can be entered.
   *
   * Otherwise the list is reachable only by being refused, and a drawing where
   * one machine is ready and another is not can be *entered* -- leaving the
   * reader with a chip that counts problems and no way to read them.
   */
  openSetupFor(tab: TabID, event: Event): void {
    event.stopPropagation();
    this.menuOpen = false;
    RightPanelComponent.tabClicked(
      tab === TabID.FORCE
        ? RightPanelComponent.FORCE_SETUP_TAB
        : RightPanelComponent.KINEMATIC_SETUP_TAB
    );
  }

  openSetup(): void {
    RightPanelComponent.tabClicked(
      this.tabs.getCurrentTab() === TabID.FORCE
        ? RightPanelComponent.FORCE_SETUP_TAB
        : RightPanelComponent.KINEMATIC_SETUP_TAB
    );
  }

  upload($event: Event): void {
    this.analytics.logEvent('upload_file');
    this.closeMenu();
    const input = $event.target as HTMLInputElement;
    // Silently. This fires when the picker is dismissed, and cancelling a
    // dialogue is not a thing that went wrong -- the reader closed it knowing
    // full well that they had chosen nothing.
    if (!input.files || input.files.length !== 1) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.notify.success('file.loaded', 'Mechanism loaded.');
      this.urlProcessor.updateFromURL(reader.result as string);
      // Reset the input so the same file can be opened again.
      input.value = '';
    };
    reader.readAsText(input.files[0]);
  }

  downloadLinkage(): void {
    this.closeMenu();
    this.analytics.logEvent('download_linkage');
    const blob = new Blob([this.urlGeneration.generateUrlQuery()], {
      type: 'text;charset=utf-8;',
    });
    const link = document.createElement('a');
    if (link.download === undefined) return;
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `PMKS+_${new Date().toISOString()}.pmks`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  copyURL(): void {
    this.closeMenu();
    this.analytics.logEvent('copyURL');
    this.urlGeneration.copyFullUrl();
    this.notify.success('share.copied', 'Link copied. Copy again after your next change.');
  }
}
