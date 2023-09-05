clear;
close all;
clc;

    % Coordinates of Joints
Pos.A = [-3.74 -2.41 0];
Pos.B = [-2.72 0.91 0];
Pos.C = [1.58 0.43 0];
Pos.D = [-0.24 4.01 0];
Pos.E = [5.08 5.31 0];
Pos.F = [8.14 3.35 0];
Pos.G = [7.32 -3.51 0];

    % Coordinates at the center of mass
Pos.CoM.AB = determineCoM([Pos.A, Pos.B]);
Pos.CoM.BCD = determineCoM([Pos.B, Pos.C, Pos.D]);
Pos.CoM.DE = determineCoM([Pos.D, Pos.E]);
Pos.CoM.EF = determineCoM([Pos.E, Pos.F]);
Pos.CoM.CFG = determineCoM([Pos.C, Pos.F, Pos.G]);

    % Distance Between Points
Pos.AB = norm(Pos.B - Pos.A);
Pos.BC = norm(Pos.C - Pos.B);
Pos.BD = norm(Pos.D - Pos.B);
Pos.CD = norm(Pos.D - Pos.C);
Pos.CF = norm(Pos.F - Pos.C);
Pos.CG = norm(Pos.G - Pos.C);
Pos.DE = norm(Pos.E - Pos.D);
Pos.EF = norm(Pos.F - Pos.E);
Pos.FG = norm(Pos.G - Pos.F);

    % Initial Angle AB
Init.Ang.AB = atan2(Pos.B(2)-Pos.A(2),Pos.B(1)-Pos.A(1)); 

% adjusting the angle to be in the ccw direction from the hozizontal
if(Init.Ang.AB < 0)
    angleAB_horizontal = 2 * pi + Init.Ang.AB;
else 
    angleAB_horizontal = Init.Ang.AB;
end 

%     % Coordinates of weights
% Pos.F1 = create3DVector(-1.70, 4.27, 0);
% 
%     % Weight of each link
% Mass.AB = 0;
% Mass.BCD = 0;
% Mass.DE = 0;
% Mass.EF = 0;
% Mass.CFG = 0;
% 
%     % Position Vectors 
% Pos.FixedJointAB = Pos.A;
% Pos.FixedJointBCD = Pos.B; 
% Pos.FixedJointDE = Pos.D;
% Pos.FixedJointEF = Pos.E;
% Pos.FixedJointCFG = Pos.C;
% 
%     % Moment of Inertia Mass
% MassMoI.AB=determineMassMoICircle(Mass.AB, Pos.A, Pos.B, 1);
% MassMoI.BCD=determineMassMoICenter(Mass.BCD, Pos.B, Pos.C, 1);
% MassMoI.DE=determineMassMoICenter(Mass.DE, Pos.E, Pos.D, 1);
% MassMoI.EF=determineMassMoICenter(Mass.EF, Pos.E, Pos.F, 1);
% MassMoI.CFG=determineMassMoICircle(Mass.CFG, Pos.F, Pos.G, 1);
% 
%     % Forces
% Force.AB = determineForceGravity(Mass.AB);
% Force.BCD = determineForceGravity(Mass.BCD);
% Force.DE = determineForceGravity(Mass.DE);
% Force.EF = determineForceGravity(Mass.EF);
% Force.CFG = determineForceGravity(Mass.CFG);
% 
% Force.F1 = create3DVector(0, -200, 0);
% 
% % Determine Kinematics input_speed = create3DVector(0, 0, 17.738 * 0.10472);
% input_speed = create3DVector(0, 0, 1.0472);
% Kin = determineKin(Pos, input_speed);
% 
% % Position 1
% Force_analysis_static_no_grav = determineForceAnalysis(Pos, Kin, Force, Mass, MassMoI, 'off', 'off');
% % Force_analysis_static_grav = determineForceAnalysis(Pos, Kin, Force, Mass, MassMoI, 'off', 'on');
% % Force_analysis_motion_no_grav = determineForceAnalysis(Pos, Kin, Force, Mass, MassMoI, 'on', 'off');
% % Force_analysis_motion_grav = determineForceAnalysis(Pos, Kin, Force, Mass, MassMoI, 'on', 'on');
% 
% Instant_center_pos1 = determineInstantCenter(Pos);

iteration = 2;
thetaIncrement = 1; % angle increment (in degrees)
theta = atan2(Pos.B(2) - Pos.A(2), Pos.B(1) - Pos.A(1)); % initial angle of link AB

max_iterations = 900;
joint_positions_A = zeros(max_iterations, 3);
joint_positions_B = zeros(max_iterations, 3);
joint_positions_C = zeros(max_iterations, 3);
joint_positions_D = zeros(max_iterations, 3);
joint_positions_E = zeros(max_iterations, 3);
joint_positions_F = zeros(max_iterations, 3);
joint_positions_G = zeros(max_iterations, 3);

joint_positions_A(1, :) = Pos.A';
joint_positions_B(1, :) = Pos.B';
joint_positions_C(1, :) = Pos.C';
joint_positions_D(1, :) = Pos.D';
joint_positions_E(1, :) = Pos.E';
joint_positions_F(1, :) = Pos.F';
joint_positions_G(1, :) = Pos.G';

iSpeed = zeros(900:1);
iSpeed(1) = 10;

% Iterate until valid positions are found for all joints or maximum iterations are reached
while ~(determineEqual(joint_positions_A(1, :), joint_positions_A(iteration - 1, :)) && ...
        determineEqual(joint_positions_B(1, :), joint_positions_B(iteration - 1, :)) && ...
        determineEqual(joint_positions_C(1, :), joint_positions_C(iteration - 1, :)) && ...
        determineEqual(joint_positions_D(1, :), joint_positions_D(iteration - 1, :)) && ...
        determineEqual(joint_positions_E(1, :), joint_positions_E(iteration - 1, :)) && ...
        determineEqual(joint_positions_F(1, :), joint_positions_F(iteration - 1, :)) && ...
        determineEqual(joint_positions_G(1, :), joint_positions_G(iteration - 1, :)) && ...
        isequal(thetaIncrement, 1) && ~isequal(iteration, 2)) && iteration < 900
    
    continueWithLoop = true;
    % Calculate current joint angles
    theta = theta + deg2rad(thetaIncrement);

    % Calculate Joint Positions
    % Initial positions of grounded joints
    A = Pos.A;
    G = Pos.G;
    
    % Determine position of joints that are connected to the input joint
    B = [Pos.A(1) + Pos.AB * cos(theta) Pos.A(2) + Pos.AB* sin(theta) 0]; % joint position B

%     B = vpa(Init.Pos.A + [Pos.AB * cos(angleAB_horizontal + deg2rad(theta)) Pos.AB * sin(angleAB_horizontal + deg2rad(theta)) 0]);

    % Determine position of joints utilizing circle-circle intersection method
    C = circleCircleIntersection(B(1), B(2), Pos.BC, ...
                                 G(1), G(2), Pos.CG, ...
                                 joint_positions_C(iteration - 1, 1), joint_positions_C(iteration - 1, 2));
    if (isempty(C))
        theta = theta - (deg2rad(1) * thetaIncrement);
        thetaIncrement = thetaIncrement * -1;
        continueWithLoop = false;
    end

    % TODO: Put this in a function call :P (and maybe think of way to
    % rewrite this...)
    if (continueWithLoop)
        D = circleCircleIntersection(B(1), B(2), Pos.BD, ...
                                 C(1), C(2), Pos.CD, ...
                                 joint_positions_D(iteration - 1, 1), joint_positions_D(iteration - 1, 2));
        if (isempty(D))
            theta = theta - (deg2rad(1) * thetaIncrement);
            thetaIncrement = thetaIncrement * -1;
            continueWithLoop = false;
        end
    end
    
    if (continueWithLoop)
        F = circleCircleIntersection(C(1), C(2), Pos.CF, ...
                                 G(1), G(2), Pos.FG, ...
                                 joint_positions_F(iteration - 1, 1), joint_positions_F(iteration - 1, 2));
        if (isempty(F))
            theta = theta - (deg2rad(1) * thetaIncrement);
            thetaIncrement = thetaIncrement * -1;
            continueWithLoop = false;
        end
    end

    if (continueWithLoop)
         E = circleCircleIntersection(D(1), D(2), Pos.DE, ...
                                 F(1), F(2), Pos.EF, ...
                                 joint_positions_E(iteration - 1, 1), joint_positions_E(iteration - 1, 2));    
        if (isempty(E))
            theta = theta - (deg2rad(1) * thetaIncrement);
            thetaIncrement = thetaIncrement * -1;
            continueWithLoop = false;
        end
    end

    if (continueWithLoop)

        % Store joint positions in arrays
        joint_positions_A(iteration, :) = A';
        joint_positions_B(iteration, :) = B';
        joint_positions_C(iteration, :) = C';
        joint_positions_D(iteration, :) = D';
        joint_positions_E(iteration, :) = E';
        joint_positions_F(iteration, :) = F';
        joint_positions_G(iteration, :) = G';

        Pos.A = A;
        Pos.B = B;
        Pos.C = C;
        Pos.D = D;
        Pos.E = E;
        Pos.F = F;
        Pos.G = G;
            
        
        iSpeed(iteration) = 10 * thetaIncrement;

        % Increment iteration counter
        iteration = iteration + 1;
        
        
%         input_speed = create3DVector(0, 0, 1.0472);
%         Kin = determineKin(Pos, input_speed, iteration);


%         Force_analysis_static_no_grav = determineForceAnalysis(Pos, Kin, Force, Mass, MassMoI, 'off', 'off');
    end
end

iteration = iteration - 1;

% Trim excess positions
joint_positions_A = joint_positions_A(1:iteration, :);
joint_positions_B = joint_positions_B(1:iteration, :);
joint_positions_C = joint_positions_C(1:iteration, :);
joint_positions_D = joint_positions_D(1:iteration, :);
joint_positions_E = joint_positions_E(1:iteration, :);
joint_positions_F = joint_positions_F(1:iteration, :);
joint_positions_G = joint_positions_G(1:iteration, :);

% Determine the kinematics for each timestep in the mechanism
for i = 1:iteration
    input_speed = create3DVector(0, 0, iSpeed(i));
    Pos.A = joint_positions_A(i, :);
    Pos.B = joint_positions_B(i, :);
    Pos.C = joint_positions_C(i, :);
    Pos.D = joint_positions_D(i, :);
    Pos.E = joint_positions_E(i, :);
    Pos.F = joint_positions_F(i, :);
    Pos.G = joint_positions_G(i, :);
    timestep = determineKin(Pos, input_speed);
    Kin.timestep(i) = timestep;
end
generateKinematicsTable(Kin, iteration)

% figure;
% hold on;
% axis equal;
% plot(Pos.A(1), Pos.A(2), 'ro', 'DisplayName', 'A');
% plot(Bx_coord, By_coord, 'ob', 'DisplayName', 'B');
% plot(Cx_coord, Cy_coord, 'og', 'DisplayName', 'C');
% plot(Dx_coord, Dy_coord, 'om', 'DisplayName', 'D');
% plot(Ex_coord, Ey_coord, 'oc', 'DisplayName', 'E');
% plot(Fx_coord, Fy_coord, 'oy', 'DisplayName', 'F');
% plot(Pos.G(1), Pos.G(2), 'ko', 'DisplayName', 'G');
% legend('Location', 'Best');
% xlabel('X');
% ylabel('Y');
% title('Kinematic Analysis');
% hold off;


function result = circleCircleIntersection(x1, y1, r1, x2, y2, r2, pointX, pointY)
    % Find intersection points
    [xIntersect, yIntersect] = circcirc(x1, y1, r1, x2, y2, r2);
    
    % Check if the intersection points are determined
    if isempty(xIntersect) || isempty(yIntersect)
        result = [];
        return;
    end
   
    if isnan(xIntersect(1)) || isnan(yIntersect(1))
        result = [];
        return;
    end 
    
    % Calculate distances from intersection points to the given point
    dist1 = sqrt((xIntersect(1) - pointX)^2 + (yIntersect(1) - pointY)^2);
    dist2 = sqrt((xIntersect(2) - pointX)^2 + (yIntersect(2) - pointY)^2);
    
    % Determine the closest intersection point
    if dist1 < dist2
        result = [xIntersect(1) yIntersect(1) 0];
    else
        result = [xIntersect(2) yIntersect(2) 0];
    end
end

function result = determineEqual(arr1, arr2)
    tolerance = 0.001;
    if ((tolerance > (arr1(1) - arr2(1))) && ...
            (tolerance > (arr1(2) - arr2(2))) && ...
            (tolerance > (arr1(3) - arr2(3))))
        result = 1;
    else
        result = 0;
    end
end
% Functions to solve for Kinematics
function sol = determineKin(Pos, input_speed)

% Determine Angular Velocity
AngVel = determineAngVel(Pos, input_speed);

w_ab = input_speed;
w_bcd = create3DVector(0, 0, double(AngVel.bcd_k));
w_de = create3DVector(0, 0, double(AngVel.de_k));
w_ef = create3DVector(0, 0, double(AngVel.ef_k));
w_cfg = create3DVector(0, 0, double(AngVel.cfg_k));

w.AB = createStructFrom3DVector(w_ab);
w.BCD = createStructFrom3DVector(w_bcd);
w.DE = createStructFrom3DVector(w_de);
w.EF = createStructFrom3DVector(w_ef);
w.CFG = createStructFrom3DVector(w_cfg);

% Determine Velocity Set ground joint velocities to 0
v_a = create3DVector(0, 0, 0);
v_g = create3DVector(0, 0, 0);

v_ba = determineLinVel(w_ab(3), Pos.B, Pos.A);
v_cb = determineLinVel(w_bcd(3), Pos.C, Pos.B);
v_db = determineLinVel(w_bcd(3), Pos.D, Pos.B);
v_ed = determineLinVel(w_de(3), Pos.E, Pos.D);
v_fe = determineLinVel(w_ef(3), Pos.F, Pos.E);
% v_gf = determineLinVel(w_gf(3), Pos.G, Pos.F);
v_gc = determineLinVel(w_cfg(3), Pos.G, Pos.C);

v_b = v_ba + v_a;
v_c = v_cb + v_b;
v_d = v_db + v_b;
v_e = v_ed + v_d;
v_f = v_fe + v_e;

v.joint.A = createStructFrom3DVector(v_a);
v.joint.B = createStructFrom3DVector(v_b);
v.joint.C = createStructFrom3DVector(v_c);
v.joint.D = createStructFrom3DVector(v_d);
v.joint.E = createStructFrom3DVector(v_e);
v.joint.F = createStructFrom3DVector(v_f);
v.joint.G = createStructFrom3DVector(v_g);

v.link.AB = v_ba;
v.link.BCD = v_cb;
v.link.DE = v_ed;
v.link.EF = v_fe;
v.link.CFG = v_gc;

% Determine Angular Acceleration
AngAcc = determineAngAcc(Pos, w);

alpha_ab = create3DVector(0, 0, 0);
alpha_bcd = create3DVector(0, 0, double(AngAcc.bcd_k));
alpha_de = create3DVector(0, 0, double(AngAcc.de_k));
alpha_ef = create3DVector(0, 0, double(AngAcc.ef_k));
alpha_cfg = create3DVector(0, 0, double(AngAcc.cfg_k));

alpha.AB = createStructFrom3DVector(alpha_ab);
alpha.BCD = createStructFrom3DVector(alpha_bcd);
alpha.DE = createStructFrom3DVector(alpha_de);
alpha.EF = createStructFrom3DVector(alpha_ef);
alpha.CFG = createStructFrom3DVector(alpha_cfg);

% Determine Acceleration Set ground joint accelerations to 0
a_a = [0, 0, 0];
a_g = [0, 0, 0];

a_ba = determineLinAcc(w_ab(3), alpha_ab(3), Pos.B, Pos.A);
a_cb = determineLinAcc(w_bcd(3), alpha_bcd(3), Pos.C, Pos.B);
a_db = determineLinAcc(w_bcd(3), alpha_bcd(3), Pos.D, Pos.B);
a_ed = determineLinAcc(w_de(3), alpha_de(3), Pos.E, Pos.D);
a_fe = determineLinAcc(w_ef(3), alpha_ef(3), Pos.F, Pos.E);
a_cg = determineLinAcc(w_cfg(3), alpha_cfg(3), Pos.C, Pos.G);

a_b = a_ba + a_a;
a_c = a_cb + a_b;
a_d = a_db + a_b;
a_e = a_ed + a_d;
a_f = a_fe + a_e;

a.joint.A = createStructFrom3DVector(a_a);
a.joint.B = createStructFrom3DVector(a_b);
a.joint.C = createStructFrom3DVector(a_c);
a.joint.D = createStructFrom3DVector(a_d);
a.joint.E = createStructFrom3DVector(a_e);
a.joint.F = createStructFrom3DVector(a_f);
a.joint.G = createStructFrom3DVector(a_g);

a.link.AB = a_ba;
a.link.BCD = a_cb;
a.link.DE = a_ed;
a.link.EF = a_fe;
a.link.CFG = a_cg;

sol.w = w;
sol.v = v;
sol.alpha = alpha;
sol.a = a;
sol.pos = Pos;
end

function sol = determineAngVel(Pos, input_speed)
syms bcd_k de_k ef_k cfg_k
% Determine 1st Loop equations V_ba + V_cb + V_gc = 0
V_ba = determineLinVel(input_speed(3), Pos.B, Pos.A);
V_cb = determineLinVel(bcd_k, Pos.C, Pos.B);
V_gc = determineLinVel(cfg_k, Pos.G, Pos.C);
eq1 = V_ba + V_cb + V_gc == 0;

% Determine 2nd Loop equations V_ba + V_bd + V_ed + V_fe + V_gf = 0
V_db = determineLinVel(bcd_k, Pos.D, Pos.B);
V_ed = determineLinVel(de_k, Pos.E, Pos.D);
V_fe = determineLinVel(ef_k, Pos.F, Pos.E);
V_gf = determineLinVel(cfg_k, Pos.G, Pos.F);
eq2 = V_ba + V_db + V_ed + V_fe + V_gf == 0;

sol = solve([eq1, eq2],[bcd_k, de_k, ef_k, cfg_k]);
% 
end

function sol = determineLinVel(ang_vel_k, pos1, pos2)
dist = determinePosVector(pos1, pos2);
sol = cross([0, 0, ang_vel_k], dist);
end

function sol = determineAngAcc(Pos, AngVel)
syms bcd_k de_k ef_k cfg_k
ba = create3DVector(0, 0, 0);

% Determine 1st Loop equations A_ba + A_cb + A_gc = 0
A_ba = determineLinAcc(AngVel.AB.z, ba(3), Pos.B, Pos.A);
A_cb = determineLinAcc(AngVel.BCD.z, bcd_k, Pos.C, Pos.B);
A_gc = determineLinAcc(AngVel.CFG.z, cfg_k, Pos.G, Pos.C);

eq1 = A_ba + A_cb + A_gc == 0;

% Determine 2nd Loop equations A_ba + A_db + A_de + A_ef + A_fg = 0
A_db = determineLinAcc(AngVel.BCD.z, bcd_k, Pos.B, Pos.D);
A_de = determineLinAcc(AngVel.DE.z, de_k, Pos.D, Pos.E);
A_ef = determineLinAcc(AngVel.EF.z, ef_k, Pos.E, Pos.F);
A_fg = determineLinAcc(AngVel.CFG.z, cfg_k, Pos.F, Pos.G);

eq2 = A_ba + A_db + A_de + A_ef + A_fg == 0;

sol = solve([eq1, eq2],[bcd_k de_k ef_k cfg_k]);
end

function sol = determineLinAcc(ang_vel_k, ang_acc_k, pos1, pos2)
dist = determinePosVector(pos1, pos2);
sol = determineTanAcc(ang_vel_k, dist) + determineNormalAcc(ang_acc_k, dist);
end

function sol = determineTanAcc(ang_vel_k, dist)
sol = cross([0, 0, ang_vel_k], cross([0, 0, ang_vel_k], dist));
end

function sol = determineNormalAcc(ang_acc_k, dist)
sol = cross([0, 0, ang_acc_k], dist);
end

    % Function to solve for Force Analysis
function sol = determineForceAnalysis(Pos, Kin, Force, Mass, MassMoI, Newtons, gravity)
syms Ax Ay Bx By Cx Cy Dx Dy Ex Ey Fx Fy Gx Gy M

% set up unknown force magnitude matrix
F_A = create3DVector(Ax, Ay, 0);
F_B = create3DVector(Bx, By, 0);
F_C = create3DVector(Cx, Cy, 0);
F_D = create3DVector(Dx, Dy, 0);
F_E = create3DVector(Ex, Ey, 0);
F_F = create3DVector(Fx, Fy, 0);
F_G = create3DVector(Gx, Gy, 0);

if strcmp(gravity, 'on')
    F_AB = Force.AB;
    F_BCD = Force.BCD;
    F_DE = Force.DE;
    F_EF = Force.EF;
    F_CFG = Force.CFG;
                    
    M_com_ab = determineMoment(Pos.AB, Pos.FixedJointAB, Force.AB);
    M_com_bcd = determineMoment(Pos.BCD, Pos.FixedJointBCD, Force.BCD);
    M_com_de = determineMoment(Pos.DE, Pos.FixedJointDE, Force.DE);
    M_com_ef = determineMoment(Pos.EF, Pos.FixedJointEF, Force.EF);
    M_com_cfg = determineMoment(Pos.CFG, Pos.FixedJointCFG, Force.CFG);
else 
    F_AB = create3DVector(0,0,0);
    F_BCD = create3DVector(0,0,0);
    F_DE = create3DVector(0,0,0);
    F_EF = create3DVector(0,0,0);
    F_CFG = create3DVector(0,0,0);
    
    M_com_ab = create3DVector(0,0,0);
    M_com_bcd = create3DVector(0,0,0);
    M_com_de = create3DVector(0,0,0);
    M_com_ef = create3DVector(0,0,0);
    M_com_cfg = create3DVector(0,0,0);
end

if strcmp(Newtons, 'on')
    a_ab = determineLinAcc(Kin.w.ab.z, Kin.alpha.ab.z, Pos.FixedJointAB, Pos.AB) + create3DVectorFromStruct(Kin.a.a);
%     a_ab = determineLinAcc(Kin.w.ab.z, Kin.alpha.ab.z, Pos.AB, Pos.FixedJointAB) + create3DVectorFromStruct(Kin.a.a);
    alpha_ab = create3DVectorFromStruct(Kin.alpha.ab);
    I_ab = MassMoI.AB + (Mass.AB * norm(Pos.AB - Pos.FixedJointAB)^2);
    
    a_bcd = determineLinAcc(Kin.w.bc.z, Kin.alpha.bc.z, Pos.FixedJointBC, Pos.BC) + create3DVectorFromStruct(Kin.a.b);
%     a_bc = determineLinAcc(Kin.w.bc.z, Kin.alpha.bc.z, Pos.BC, Pos.FixedJointBC) + create3DVectorFromStruct(Kin.a.b);
    alpha_bcd = create3DVectorFromStruct(Kin.alpha.bc);
    I_bcd = MassMoI.BC + (Mass.BC * norm(Pos.BC - Pos.FixedJointBC)^2);

    a_de = determineLinAcc(Kin.w.cde.z, Kin.alpha.cde.z, Pos.FixedJointCDE, Pos.CDE) + create3DVectorFromStruct(Kin.a.c);
%     a_cde = determineLinAcc(Kin.w.cde.z, Kin.alpha.cde.z, Pos.CDE, Pos.FixedJointCDE) + create3DVectorFromStruct(Kin.a.c);
    alpha_de = create3DVectorFromStruct(Kin.alpha.cde);
    I_de =  MassMoI.CDE + (Mass.CDE * norm(Pos.CDE - Pos.FixedJointCDE)^2);
    
    a_ef = determineLinAcc(Kin.w.ef.z, Kin.alpha.ef.z, Pos.FixedJointEF, Pos.EF) + create3DVectorFromStruct(Kin.a.e);
%     a_ef = determineLinAcc(Kin.w.ef.z, Kin.alpha.ef.z, Pos.EF, Pos.FixedJointEF) + create3DVectorFromStruct(Kin.a.e);
    alpha_ef = create3DVectorFromStruct(Kin.alpha.ef);
    I_ef = MassMoI.EF + (Mass.EF * norm(Pos.EF - Pos.FixedJointEF)^2);
    
    a_cfg = determineLinAcc(Kin.w.fgh.z, Kin.alpha.fgh.z, Pos.FixedJointFGH, Pos.FGH) + create3DVectorFromStruct(Kin.a.f);
%     a_fgh = determineLinAcc(Kin.w.fgh.z, Kin.alpha.fgh.z, Pos.FGH, Pos.FixedJointFGH) + create3DVectorFromStruct(Kin.a.f);
    alpha_cfg = create3DVectorFromStruct(Kin.alpha.fgh);
    I_cfg = MassMoI.FGH + (Mass.FGH * norm(Pos.FGH - Pos.FixedJointFGH)^2);
else
    a_ab = create3DVector(0,0,0);
    alpha_ab = create3DVector(0,0,0);
    I_ab = 0;
    
    a_bcd = create3DVector(0,0,0);
    alpha_bcd = create3DVector(0,0,0);
    I_bcd = 0;
    
    a_de = create3DVector(0,0,0);
    alpha_de = create3DVector(0,0,0);
    I_de = 0;
    
    a_ef = create3DVector(0,0,0);
    alpha_ef = create3DVector(0,0,0);
    I_ef = 0;
    
    a_cfg = create3DVector(0,0,0);
    alpha_cfg = create3DVector(0,0,0);
    I_cfg = 0;
end

% Link AB
eq1 = setEq(F_A + F_B + F_AB, Mass.AB * a_ab);
M_o = create3DVector(0, 0, M);
M_ab_a = determineMoment(Pos.A, Pos.FixedJointAB, F_A);
M_ab_b = determineMoment(Pos.B, Pos.FixedJointAB, F_B);
eq2 = setEq(M_o + M_ab_a + M_ab_b + M_com_ab, I_ab * alpha_ab);
F_A = flipForceSigns(F_A); 
F_B = flipForceSigns(F_B); 

% Link BCD
eq3 = setEq(F_B + F_C + F_D + F_BCD, Mass.BCD * a_bcd);
M_bcd_b = determineMoment(Pos.B, Pos.FixedJointBCD, F_B);
M_bcd_c = determineMoment(Pos.C, Pos.FixedJointBCD, F_C);
M_bcd_d = determineMoment(Pos.D, Pos.FixedJointBCD, F_D);
eq4 = setEq(M_bcd_b + M_bcd_c + M_bcd_d + M_com_bcd, I_bcd * alpha_bcd);
F_B = flipForceSigns(F_B); 
F_C = flipForceSigns(F_C); 
F_D = flipForceSigns(F_D);

% Link DE
eq5 = setEq(F_D + F_E + F_DE, Mass.DE * a_de);
M_de_d = determineMoment(Pos.D, Pos.FixedJointDE, F_D);
M_de_e = determineMoment(Pos.E, Pos.FixedJointDE, F_E);
eq6 = setEq(M_de_d + M_de_e + M_com_de, I_de * alpha_de);
F_D = flipForceSigns(F_D);
F_E = flipForceSigns(F_E);

% Link EF
eq7 = setEq(F_E + F_F + F_EF, Mass.EF * a_ef);
M_ef_e = determineMoment(Pos.E, Pos.FixedJointEF, F_E);
M_ef_f = determineMoment(Pos.F, Pos.FixedJointEF, F_F);
eq8 = setEq(M_ef_e + M_ef_f + M_com_ef, I_ef * alpha_ef);
F_E = flipForceSigns(F_E); 
F_F = flipForceSigns(F_F); 

% Link CFG
eq9 = setEq(F_C + F_F + F_G + F_CFG, Mass.CFG * a_cfg);
M_cfg_c = determineMoment(Pos.C, Pos.FixedJointCFG, F_C);
M_cfg_f = determineMoment(Pos.F, Pos.FixedJointCFG, F_F);
M_cfg_g = determineMoment(Pos.G, Pos.FixedJointCFG, F_G);
eq10 = setEq(M_cfg_c + M_cfg_f + M_cfg_g + M_com_cfg, (I_cfg * alpha_cfg));
F_C = flipForceSigns(F_C);
F_F = flipForceSigns(F_F);
F_G = flipForceSigns(F_G);


solution = solve([eq1,eq2,eq3,eq4,eq5,eq6,eq7,eq8,eq9,eq10],[Ax Ay Bx By Cx Cy Dx Dy Ex Ey Fx Fy Gx Gy M]);
sol.A = createStruct(double(solution.Ax), double(solution.Ay), 0);
sol.B = createStruct(double(solution.Bx), double(solution.By), 0);
sol.C = createStruct(double(solution.Cx), double(solution.Cy), 0);
sol.D = createStruct(double(solution.Dx), double(solution.Dy), 0);
sol.E = createStruct(double(solution.Ex), double(solution.Ey), 0);
sol.F = createStruct(double(solution.Fx), double(solution.Fy), 0);
sol.G = createStruct(double(solution.Gx), double(solution.Gy), 0);
sol.M = createStruct(0, 0, double(solution.M));
end

function sol = flipForceSigns(force)
sol = force * -1;
end

function sum = setEq(A, B)
sum = A == B;
end

function sol = determineForceGravity(mass)
sol = [0, mass * -9.81, 0];
end

function sol = determineMoment(pos, fixed_moment, force)
dist = determinePosVector(pos, fixed_moment);
sol = cross(dist, force);
end

function sol = determineMassMoICenter(mass, pos1, pos2, width)
dist = norm(determinePosVector(pos1, pos2));
circ_mass_moi = determineMassMoICircle(mass, pos1, pos2, width);
sol = double(circ_mass_moi + mass * (dist(1) / 2).^2);
end

function sol = determineMassMoICircle(mass, pos1, pos2, width)
dist = norm(determinePosVector(pos1, pos2));
sol = double(mass * (dist + width).^2 * (width).^2 / 12);
end

    % Function to solve for Instant Centers
function ics = determineInstantCenter(Pos)
% Primary ICs

% I12
ic12 = createStructFrom3DVector(Pos.A);
% I23
ic23 = createStructFrom3DVector(Pos.B);
% I34
ic34 = createStructFrom3DVector(Pos.C);
% I41
ic14 = createStructFrom3DVector(Pos.D);
% I45
ic45 = createStructFrom3DVector(Pos.E);
% I56
ic56 = createStructFrom3DVector(Pos.F);
% I61
ic16 = createStructFrom3DVector(Pos.G);

% Secondary ICs ic1
ic13 = determineTwoLineIntersection(ic12, ic23, ic14, ic34);
% ic2
ic24 = determineTwoLineIntersection(ic12, ic14, ic23, ic34);
% ic3
ic15 = determineTwoLineIntersection(ic14, ic45, ic16, ic56);
% ic4
ic46 = determineTwoLineIntersection(ic14, ic16, ic45, ic56);
% ic5
ic35 = determineTwoLineIntersection(ic34, ic45, ic13, ic15);
% ic6
ic25 = determineTwoLineIntersection(ic24, ic45, ic12, ic15);
% ic7
ic26 = determineTwoLineIntersection(ic12, ic16, ic25, ic56);
% ic8
ic36 = determineTwoLineIntersection(ic23, ic26, ic34, ic46);

ics.ic12 = ic12;
ics.ic13 = ic13;
ics.ic14 = ic14;
ics.ic15 = ic15;
ics.ic16 = ic16;
ics.ic23 = ic23;
ics.ic24 = ic24;
ics.ic25 = ic25;
ics.ic26 = ic26;
ics.ic34 = ic34;
ics.ic35 = ic35;
ics.ic36 = ic36;
ics.ic45 = ic45;
ics.ic46 = ic46;
ics.ic56 = ic56;
end

% function line = determineLine(p1, p2) line = polyfit([point1(1),
% point2(1)], [point1(2), point2(2)], 1); end

% https://www.mathworks.com/matlabcentral/answers/70287-to-find-intersection-point-of-two-lines
function point = determineTwoLineIntersection(p1, p2, p3, p4)
l1 = polyfit([p1.x, p2.x], [p1.y, p2.y], 1);
l2 = polyfit([p3.x, p4.x], [p3.y, p4.y], 1);
point.x = fzero(@(x) polyval(l1-l2,x),3);
point.y = polyval(l1,point.x);
end

    % Function to set up variables as struct vectors
function vector = create3DVector(xMag, yMag, zMag)
vector = [xMag, yMag, zMag];
end

function struct = createStruct(xMag, yMag, zMag)
struct.x = xMag;
struct.y = yMag;
struct.z = zMag;
end

function struct = createStructFrom3DVector(vector3D)
struct.x = vector3D(1);
struct.y = vector3D(2);
struct.z = vector3D(3);
end

function vector = create3DVectorFromStruct(struct)
vector = [struct.x, struct.y, struct.z];
end

function com = determineCoM(poses)
sumX = 0;
sumY = 0;
sumZ = 0;

numPoses = size(poses, 1);
for i = 1:numPoses
    pose = poses(i,:);
    sumX = sumX + pose(1);
    sumY = sumY + pose(2);
    sumZ = sumZ + pose(3);    
end

% Calculate average position
avgX = sumX / numPoses;
avgY = sumY / numPoses;
avgZ = sumZ / numPoses;

com = [avgX, avgY, avgZ];
end

function dist = determinePosVector(pos1, pos2)
dist = vpa(pos1 - pos2);
end
    % functions for generating table
function generateKinematicsTable(Kin, index)
    jointNames = {'A', 'B', 'C', 'D', 'E', 'F', 'G'};
    linkNames = {'AB', 'BCD', 'DE', 'EF', 'CFG'};
    
    % Preallocate cell arrays to store joint kinematics
    jointPositions = cell(1, numel(jointNames) * index);
    jointVelocities = cell(1, numel(jointNames) * index);
    jointAccelerations = cell(1, numel(jointNames) *index);

    linkPositions =  cell(1, numel(linkNames) * index);
    linkVelocities =  cell(1, numel(linkNames) * index);
    linkAccelerations =  cell(1, numel(linkNames) * index);

    angularPositions =  cell(1, numel(linkNames) * index);
    angularVelocities =  cell(1, numel(linkNames) * index);
    angularAccelerations =  cell(1, numel(linkNames) * index);
    
    % Get joint kinematics for each joint
    for i = 1:index
        for j = 1:numel(jointNames)
            jointPositions{j + (i - 1)*numel(jointNames)} = Kin.timestep(i).pos.(jointNames{j});
            jointVelocities{j + (i - 1)*numel(jointNames)} = Kin.timestep(i).v.joint.(jointNames{j});
            jointAccelerations{j + (i - 1)*numel(jointNames)} = Kin.timestep(i).a.joint.(jointNames{j});
        end
        
        for l = 1:numel(linkNames)
            linkPositions{l + (i - 1)*numel(linkNames)} = Kin.timestep(i).pos.CoM.(linkNames{l});
            linkVelocities{l + (i - 1)*numel(linkNames)} = Kin.timestep(i).v.link.(linkNames{l});
            linkAccelerations{l + (i - 1)*numel(linkNames)} = Kin.timestep(i).a.link.(linkNames{l});
            angularPositions{l + (i - 1)*numel(linkNames)} = Kin.timestep(i).pos.CoM.(linkNames{l});
            angularVelocities{l + (i - 1)*numel(linkNames)} = Kin.timestep(i).w.(linkNames{l});
            angularAccelerations{l + (i - 1)*numel(linkNames)} = Kin.timestep(i).alpha.(linkNames{l});
        end
    end

    % Create empty tables for each section
    jointTable = createJointTable(jointPositions, jointVelocities, jointAccelerations, jointNames);
    linkTable = createLinkTable(linkPositions, linkVelocities, linkAccelerations, linkNames);
    angularTable = createAngularTable(angularPositions, angularVelocities, angularAccelerations, linkNames);

    % Combine the tables into a single table
    kinematicsTable = combineTables(jointTable, linkTable, angularTable);

    % Save the table as a CSV file
    directory = '\Users\jmrhodes\Downloads';  % Specify the directory where you want to save the table
    filename = 'kinematics_table.csv'; % Specify the filename for the table
    fullPath = fullfile(directory, filename); % Create the full path to the file
    writetable(kinematicsTable, fullPath);
end

function jointTable = createJointTable(jointPositions, jointVelocities, jointAccelerations, jointNames)
% Create an empty table for joint kinematics

% Set column names for the joint table
columnNames = cell(1, numel(jointNames) * 2 * 3); % 3 variables (pos, vel, acc) for each joint, 2 directions (X, Y)
count = 1;
for i = 1:numel(jointNames)
    columnNames{count} = strcat('Joint ', jointNames{i}, ' X');
    columnNames{count+1} = strcat('Joint ', jointNames{i}, ' Y');
    columnNames{count+2} = strcat('Joint ', jointNames{i}, ' Velocity X');
    columnNames{count+3} = strcat('Joint ', jointNames{i}, ' Velocity Y');
    columnNames{count+4} = strcat('Joint ', jointNames{i}, ' Acceleration X');
    columnNames{count+5} = strcat('Joint ', jointNames{i}, ' Acceleration Y');
    count = count + 6;
end

% Iterate over timesteps
numTimesteps = (numel(jointPositions) / numel(jointNames));

jointTable = table();

for i = 1:numel(columnNames)
    jointTable.(columnNames{i}) = 0;
end

for t = 1:numTimesteps
    % Create a row for the current timestep
    row = {};
    for j = 1:numel(jointNames)
        % Get joint kinematic information at the current timestep
        jointPos = jointPositions{j + (t - 1)* numel(jointNames)}(:);
        jointVel = jointVelocities{j + (t - 1)* numel(jointNames)};
        jointAcc = jointAccelerations{j + (t - 1)* numel(jointNames)};
        % Add joint kinematic information to the row
        row = [row; jointPos(1); jointPos(2); jointVel.x; jointVel.y; jointAcc.x; jointAcc.y];
    end
    % Add the row to the joint table
    jointTable(t, :) = sym2cell(row');
    
end
end

function linkTable = createLinkTable(linkPositions, linkVelocities, linkAccelerations, linkNames)
% Create an empty table for link kinematics

% Set column names for the link table
columnNames = cell(1, numel(linkNames) * 2 * 3); % 3 variables (pos, vel, acc) for each link, 2 directions (X, Y)
count = 1;
for i = 1:numel(linkNames)
    columnNames{count} = strcat('Link ', linkNames{i}, ' X');
    columnNames{count+1} = strcat('Link ', linkNames{i}, ' Y');
    columnNames{count+2} = strcat('Link ', linkNames{i}, ' Velocity X');
    columnNames{count+3} = strcat('Link ', linkNames{i}, ' Velocity Y');
    columnNames{count+4} = strcat('Link ', linkNames{i}, ' Acceleration X');
    columnNames{count+5} = strcat('Link ', linkNames{i}, ' Acceleration Y');
    count = count + 6;
end

% Iterate over timesteps
numTimesteps = (numel(linkPositions) / numel(linkNames));

linkTable = table();

for i = 1:numel(columnNames)
    linkTable.(columnNames{i}) = 0;
end

for t = 1:numTimesteps
    % Create a row for the current timestep
    row = {};
    for l = 1:numel(linkNames)
        % Get joint kinematic information at the current timestep
        linkPos = linkPositions{l + (t - 1)* numel(linkNames)}(:);
        linkVel = linkVelocities{l + (t - 1)* numel(linkNames)};
        linkAcc = linkAccelerations{l + (t - 1)* numel(linkNames)};
        % Add joint kinematic information to the row
        row = [row; linkPos(1); linkPos(2); linkVel(1); linkVel(2); linkAcc(1); linkAcc(2)];
    end
    % Add the row to the joint table
    linkTable(t, :) = sym2cell(row');
end
end

function angTable = createAngularTable(angularPositions, angularVelocities, angularAccelerations, linkNames)
% Create an empty table for joint kinematics

% Set column names for the joint table
columnNames = cell(1, numel(linkNames) * 1 * 3); % 3 variables (pos, vel, acc) for each joint, 1 directions (Z)
count = 1;
for i = 1:numel(linkNames)
    columnNames{count} = strcat('Angle ', linkNames{i});
    columnNames{count+1} = strcat('Angular Velocity ', linkNames{i});
    columnNames{count+2} = strcat('Angular Acceleration ', linkNames{i});
    count = count + 3;
end

% Iterate over timesteps
numTimesteps = (numel(angularPositions) / numel(linkNames));

angTable = table();

for i = 1:numel(columnNames)
    angTable.(columnNames{i}) = 0;
end

for t = 1:numTimesteps
    % Create a row for the current timestep
    row = {};
    for a = 1:numel(linkNames)
        % Get joint kinematic information at the current timestep
        ang = angularPositions{a + (t - 1)* numel(linkNames)};
        angVel = angularVelocities{a + (t - 1)* numel(linkNames)};
        angAcc = angularAccelerations{a + (t - 1)* numel(linkNames)};
        % Add joint kinematic information to the row
        row = [row; ang(3); angVel.z; angAcc.z];
    end
    % Add the row to the joint table
    angTable(t, :) = row';
end
end

function combinedTable = combineTables(jointTable, linkTable, angularTable)
    % Combine the joint, link, and angular tables into a single table
    % Check if any of the tables is empty
    filler = table(cell(height(jointTable), 1), 'VariableNames',{' '});
    filler2 = table(cell(height(jointTable), 1), 'VariableNames',{'  '});
    if isempty(jointTable)
        combinedTable = linkTable;
        if ~isempty(angularTable)
            combinedTable = [combinedTable, filler, angularTable];
        end
    elseif isempty(linkTable)
        combinedTable = jointTable;
        if ~isempty(angularTable)
            combinedTable = [combinedTable, filler, angularTable];
        end
    elseif isempty(angularTable)
        combinedTable = [jointTable, filler, linkTable];
    else
        combinedTable = [jointTable, filler, linkTable, filler2, angularTable];
    end
end
