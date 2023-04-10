enum JOINT_TYPE {PRISMATIC_JOINT, REVOLUTE_JOINT}

export abstract class GenericEncoder {

    abstract addJoint(
        type: JOINT_TYPE,
        id: string,
        x: number,
        y: number,
        isGrounded: boolean,
        isInput: boolean,
        angleRadians?: number
    ): void;

    abstract addGenericLink(
        id: string,
        mass: number
    ): void;

    abstract addRealLink(
        id: string,
        mass: number,
        massMoI: number,
        jointIDs: string[],
        forceIDs: string[]
    ): void;

    abstract addForce(
        
    )

}