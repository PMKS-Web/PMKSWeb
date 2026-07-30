import { ComponentFixture, TestBed } from '@angular/core/testing';
import ApexCharts from 'apexcharts';
import { AnalysisApexChartComponent } from './analysis-apex-chart.component';

class FakeApexCharts {
  static instances: FakeApexCharts[] = [];

  render = vi.fn().mockResolvedValue(this);
  updateOptions = vi.fn().mockResolvedValue(this);
  destroy = vi.fn();
  clearAnnotations = vi.fn();
  addXaxisAnnotation = vi.fn();
  addPointAnnotation = vi.fn();

  constructor(
    public host: HTMLElement,
    public options: ApexCharts.ApexOptions
  ) {
    FakeApexCharts.instances.push(this);
  }
}

describe('AnalysisApexChartComponent', () => {
  let fixture: ComponentFixture<AnalysisApexChartComponent>;
  let originalApexCharts: typeof ApexCharts | undefined;
  const chartWindow = window as unknown as { ApexCharts?: typeof ApexCharts };

  beforeEach(async () => {
    originalApexCharts = chartWindow.ApexCharts;
    FakeApexCharts.instances = [];
    chartWindow.ApexCharts = FakeApexCharts as unknown as typeof ApexCharts;
    await TestBed.configureTestingModule({
      declarations: [AnalysisApexChartComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(AnalysisApexChartComponent);
  });

  afterEach(() => {
    fixture.destroy();
    chartWindow.ApexCharts = originalApexCharts;
    TestBed.resetTestingModule();
  });

  it('renders from the eager browser bundle without importing a deferred module', async () => {
    fixture.componentRef.setInput('chart', { type: 'line' });
    fixture.componentRef.setInput('series', [{ name: 'X', data: [1, 2] }]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(FakeApexCharts.instances).toHaveLength(1);
    expect(FakeApexCharts.instances[0].host).toBe(
      fixture.nativeElement.querySelector('div:not(.chart-render-error)')
    );
    expect(FakeApexCharts.instances[0].options.series).toEqual([{ name: 'X', data: [1, 2] }]);
    expect(FakeApexCharts.instances[0].options).not.toHaveProperty('markers');
    expect(FakeApexCharts.instances[0].render).toHaveBeenCalledOnce();
  });

  it('updates an existing chart and delegates animation annotations', async () => {
    fixture.componentRef.setInput('chart', { type: 'line' });
    fixture.componentRef.setInput('series', [{ name: 'X', data: [1, 2] }]);
    fixture.detectChanges();
    await fixture.whenStable();
    const chart = FakeApexCharts.instances[0];

    fixture.componentRef.setInput('colors', ['#313aa7']);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.addXaxisAnnotation({ x: 1 }, false);
    fixture.componentInstance.addPointAnnotation({ x: 1, y: 2 }, false);
    fixture.componentInstance.clearAnnotations();

    expect(FakeApexCharts.instances).toHaveLength(1);
    expect(chart.updateOptions).toHaveBeenCalledWith(
      expect.objectContaining({ colors: ['#313aa7'] }),
      false,
      true
    );
    expect(chart.addXaxisAnnotation).toHaveBeenCalledWith({ x: 1 }, false);
    expect(chart.addPointAnnotation).toHaveBeenCalledWith({ x: 1, y: 2 }, false);
    expect(chart.clearAnnotations).toHaveBeenCalledOnce();
  });

  it('shows a diagnostic instead of leaving a blank chart when the renderer is unavailable', async () => {
    chartWindow.ApexCharts = undefined;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fixture.componentRef.setInput('chart', { type: 'line' });
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain(
      'Graph rendering failed'
    );
  });
});
