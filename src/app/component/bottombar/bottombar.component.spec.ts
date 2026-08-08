import { TestBed } from '@angular/core/testing';
import { BottombarComponent } from './bottombar.component';
import { AppModule } from '../../app.module';
import { MechanismService } from '../../services/mechanism.service';

// Found by building a linkage with a real mouse rather than with dispatched
// events: the very first bar anybody draws is not grounded, mobility is not a
// number until something is, and the bottom bar was printing the NaN it got.

describe('the mobility readout', () => {
  let component: BottombarComponent;
  let mechanism: MechanismService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AppModule] });
    component = TestBed.createComponent(BottombarComponent).componentInstance;
    mechanism = TestBed.inject(MechanismService);
  });

  // MechanismService is a root singleton and its `mechanisms` array outlives a
  // TestBed, so put back whatever was there: a spec that leaves it truncated
  // fails a completely unrelated file later in the run.
  let original: unknown[];
  beforeEach(() => {
    original = [...(mechanism.mechanisms as unknown as unknown[])];
  });
  afterEach(() => {
    (mechanism.mechanisms as unknown as unknown[]).length = 0;
    (mechanism.mechanisms as unknown as unknown[]).push(...original);
  });

  const withDof = (dof: number) => {
    (mechanism.mechanisms as unknown as { dof: number }[])[0] = { dof };
  };

  it('shows a dash before there is any mechanism at all', () => {
    // A freshly opened app has no entry in `mechanisms` yet, and the template
    // used to reach straight through it for `.dof`.
    (mechanism.mechanisms as unknown as unknown[]).length = 0;
    expect(component.degreesOfFreedom).toBe('—');
  });

  it('shows a dash rather than NaN when nothing is grounded', () => {
    withDof(NaN);
    expect(component.degreesOfFreedom).toBe('—');
  });

  it('still shows the number when there is one, including zero', () => {
    withDof(1);
    expect(component.degreesOfFreedom).toBe('1');
    // Zero is a real answer -- an over-constrained linkage -- and must not be
    // swallowed by a falsy check.
    withDof(0);
    expect(component.degreesOfFreedom).toBe('0');
    // So is a negative one, which is how an over-constrained mechanism reads
    // before the rigid-body grouping gets to it.
    withDof(-1);
    expect(component.degreesOfFreedom).toBe('-1');
  });
});
