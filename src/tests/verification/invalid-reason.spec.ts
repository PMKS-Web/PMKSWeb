import '../../app/model/joint';
import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { MechanismService } from '../../app/services/mechanism.service';

// §6: "this linkage is not valid" is true of every failure and useful for none
// of them. An excavator boom is three cylinders and therefore three degrees of
// freedom, which the plan named as the most likely disappointment once
// cylinders existed -- so the reason has to name the number, or the joints, or
// whatever it actually is.

/** A service standing on its own, with whatever joints and links are given. */
function serviceWith(joints: RealJoint[], links: RealLink[]): MechanismService {
  const service = Object.create(MechanismService.prototype) as MechanismService;
  Object.assign(service, { joints, links, forces: [], mechanisms: [] });
  return service;
}

const bar = (id: string, joints: RealJoint[]) => {
  const link = new RealLink(id, joints, 1, 1);
  joints.forEach((joint) => joint.links.push(link));
  return link;
};

describe('why a mechanism will not run', () => {
  it('names the degrees of freedom when there are too many', () => {
    const a = new RevJoint('A', 0, 0, false, true);
    const b = new RevJoint('B', 1, 0);
    const service = serviceWith([a, b], [bar('AB', [a, b])]);
    a.input = true;
    // A bar on one ground pin: two degrees of freedom short of nothing, and one
    // input cannot drive them.
    (service as unknown as { mechanisms: unknown[] }).mechanisms = [
      { dof: 2, isMechanismValid: () => false } as never,
    ];

    const reason = service.invalidReason();
    expect(reason).toContain('2 degrees of freedom');
    expect(reason).toContain('one input');
  });

  it('says so when nothing is driven', () => {
    const a = new RevJoint('A', 0, 0, false, true);
    const b = new RevJoint('B', 1, 0);
    const service = serviceWith([a, b], [bar('AB', [a, b])]);
    (service as unknown as { mechanisms: unknown[] }).mechanisms = [
      { dof: 1, isMechanismValid: () => false } as never,
    ];

    expect(service.invalidReason()).toContain('No joint is driven');
  });

  it('names the slider that has nowhere to slide', () => {
    const pin = new RevJoint('C', 0, 0);
    const slider = new PrisJoint('P', 0, 0);
    const service = serviceWith([pin, slider], []);
    expect(service.invalidReason()).toContain('nothing to slide along');
  });

  it('says nothing at all when the mechanism is fine', () => {
    const a = new RevJoint('A', 0, 0, false, true);
    const service = serviceWith([a], []);
    (service as unknown as { oneValidMechanismExists: () => boolean }).oneValidMechanismExists =
      () => true;
    expect(service.invalidReason()).toBeUndefined();
  });
});
