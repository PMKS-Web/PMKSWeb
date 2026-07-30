import {
  AfterViewInit,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import ApexCharts, {
  ApexAnnotations,
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexGrid,
  ApexLegend,
  ApexMarkers,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
} from 'apexcharts';

declare global {
  interface Window {
    ApexCharts?: typeof ApexCharts;
  }
}

/**
 * Small Angular bridge for the ApexCharts bundle loaded by angular.json.
 *
 * ng-apexcharts defers `apexcharts/client` until a chart first appears. Safari can retain that
 * deferred Vite URL across a development rebuild and then receive a 504 "Outdated Optimize Dep",
 * leaving every graph blank. Using the eagerly loaded browser bundle removes that stale request.
 */
@Component({
  selector: 'app-analysis-apex-chart',
  template: `
    @if (renderError) {
      <div class="chart-render-error" role="status">{{ renderError }}</div>
    }
    <div #chartHost></div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class AnalysisApexChartComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() annotations?: ApexAnnotations;
  @Input() chart?: ApexChart;
  @Input() colors?: string[];
  @Input() dataLabels?: ApexDataLabels;
  @Input() grid?: ApexGrid;
  @Input() legend?: ApexLegend;
  @Input() markers?: ApexMarkers;
  @Input() series: ApexAxisChartSeries = [];
  @Input() stroke?: ApexStroke;
  @Input() tooltip?: ApexTooltip;
  @Input() xaxis?: ApexXAxis;
  @Input() yaxis?: ApexYAxis;

  @ViewChild('chartHost', { static: true }) chartHost!: ElementRef<HTMLElement>;

  renderError: string | null = null;
  chartInstance?: ApexCharts;

  private viewInitialized = false;
  private destroyed = false;
  private updateGeneration = 0;

  constructor(
    private zone: NgZone,
    private changeDetector: ChangeDetectorRef
  ) {}

  ngOnChanges(_changes: SimpleChanges): void {
    this.scheduleUpdate();
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.scheduleUpdate();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.updateGeneration++;
    this.chartInstance?.destroy();
    this.chartInstance = undefined;
  }

  updateOptions(
    options: object,
    redrawPaths?: boolean,
    animate?: boolean,
    updateSyncedCharts?: boolean
  ): Promise<unknown> | undefined {
    return this.chartInstance?.updateOptions(options, redrawPaths, animate, updateSyncedCharts);
  }

  clearAnnotations(): void {
    this.chartInstance?.clearAnnotations();
  }

  addXaxisAnnotation(options: object, pushToMemory?: boolean): void {
    this.chartInstance?.addXaxisAnnotation(options, pushToMemory);
  }

  addPointAnnotation(options: object, pushToMemory?: boolean): void {
    this.chartInstance?.addPointAnnotation(options, pushToMemory);
  }

  private scheduleUpdate(): void {
    if (!this.viewInitialized || this.destroyed) return;
    const generation = ++this.updateGeneration;
    queueMicrotask(() => {
      if (generation !== this.updateGeneration || this.destroyed) return;
      void this.renderOrUpdate();
    });
  }

  private async renderOrUpdate(): Promise<void> {
    try {
      const options = this.options();
      if (this.chartInstance) {
        await this.zone.runOutsideAngular(() =>
          this.chartInstance!.updateOptions(options, false, true)
        );
      } else {
        const ApexChartsConstructor = window.ApexCharts;
        if (!ApexChartsConstructor) {
          throw new Error('The chart renderer did not load.');
        }
        this.chartInstance = this.zone.runOutsideAngular(
          () => new ApexChartsConstructor(this.chartHost.nativeElement, options)
        );
        await this.zone.runOutsideAngular(() => this.chartInstance!.render());
      }
      this.zone.run(() => {
        this.renderError = null;
        this.changeDetector.markForCheck();
      });
    } catch (error) {
      console.error('Unable to render analysis graph.', error);
      this.zone.run(() => {
        this.renderError = 'Graph rendering failed. Reload the page and try again.';
        this.changeDetector.markForCheck();
      });
    }
  }

  private options(): ApexCharts.ApexOptions {
    const options: ApexCharts.ApexOptions = {
      annotations: this.annotations,
      chart: this.chart,
      colors: this.colors,
      dataLabels: this.dataLabels,
      grid: this.grid,
      legend: this.legend,
      markers: this.markers,
      series: this.series,
      stroke: this.stroke,
      tooltip: this.tooltip,
      xaxis: this.xaxis,
      yaxis: this.yaxis,
    };
    // ApexCharts treats an explicitly present `undefined` as an override of its default. Safari
    // then fails inside configuration reads such as `markers.size`. Match ng-apexcharts' contract
    // by omitting inputs that were not supplied.
    return Object.fromEntries(
      Object.entries(options).filter(([, value]) => value !== undefined)
    ) as ApexCharts.ApexOptions;
  }
}
