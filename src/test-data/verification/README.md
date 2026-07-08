# MATLAB verification data

Reference kinematics and force traces for six mechanism configurations,
exported from the MATLAB solvers in
[PMKS-Web/PMKS_Verification](https://github.com/PMKS-Web/PMKS_Verification).
The specs in `src/tests/verification/` rebuild each mechanism with the PMKS+
model classes (fixtures in `src/test-utils/verification/fixtures.ts`) and
compare every solver output — joint/CoM positions, velocities, accelerations,
angular kinematics, joint reaction forces, and input torque — against these
series.

Regenerate with:

```sh
git clone https://github.com/PMKS-Web/PMKS_Verification /tmp/PMKS_Verification
node scripts/generate-verification-data.mjs /tmp/PMKS_Verification
```

Rows are 1-degree input-crank increments starting from the initial position
(reversing at toggle points for non-full-rotation linkages), which is also
PMKS+'s own timestep discretization. The specs align rows by crank angle and
sweep direction rather than by index, because the two implementations detect
toggle points a step or two apart.

Known defects in the MATLAB reference (verified by hand against rigid-body
kinematics) are excluded or tolerance-adjusted _in the specs_, each with a
comment explaining the exclusion — see the `excludeSeries`/`seriesTolerances`
entries in each spec. The generator also skips datasets that are unusable at
the source (all-zero force scenarios that were never run, secondary-speed
exports with only one populated row, and Stephenson Example 1's force data,
whose MATLAB free-body equations contain a copy-paste error).
