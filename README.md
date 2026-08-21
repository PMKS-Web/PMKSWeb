# Planar Mechanism Kinematic Simulator Plus (PMKS+)

![Github Hero](https://github.com/PMKS-Web/PMKSWeb/assets/19924289/02b57e93-5421-47e0-92fc-b24798eb6867)


PMKS+ (Planar Mechanism Kinematic Simulator Plus) is an educational web-based tool designed for comprehensive 2D linkage analysis. It offers an interactive platform for users to rapidly create, edit, and analyze planar linkages. Along with performing kinematic and force analysis, PMKS+ allows for easy sharing of linkages with peers or teaching staff.

Built with a strong emphasis on the four core principles of education, flexibility, collaboration, and accessibility, PMKS+ aims to provide a user-friendly experience that aids learning and promotes understanding of complex concepts in a simplified manner.

## Key Features

Interactive Linkage Creation & Editing: Easily create and modify planar linkages with a user-friendly interface.
- Comprehensive Analysis: Perform detailed kinematic and force analysis on your linkages.
- Collaborative Learning Environment: Share your linkages with classmates, peers, or teaching staff for collaborative learning and problem-solving.
- Designed for Education: PMKS+ is developed with a focus on educational use, making complex planar mechanism concepts more approachable and understandable.
- Flexibility & Accessibility: As a web-based tool, PMKS+ can be accessed from anywhere, providing flexibility and convenience to its users.

## Verification

A Matlab Script (SixBarVerification.m) was used to verify the Analysis and the v,p,a obtained from this [Mechanism](https://app.pmksplus.com/?0P.SS.K,0.101.MA,A,0wS,0bg,0.GB,B,0gW,EE,0.GC,C,Oi,6k,0.GD,D,03m,_g,0.GE,E,1FO,1I_,0.GF,F,1-C,qM,0.KG,G,1oO,0ss,0..YRAB,AB,Fe,Fe,0oU,0Bk,c5cae9,A,B,,.YRBCD,BCD,Fe,Fe,07C,Rt,303e9f,B,C,D,,.YRDE,DE,Fe,Fe,bq,18q,0d125a,D,E,,.YREF,EF,Fe,Fe,1dI,13g,B2DFDB,E,F,,.YRFCG,FCG,Fe,Fe,1Om,1Q,26A69A,F,C,G,,...JGp)
. The values were compared and a [test script](https://github.com/PMKS-Web/PMKSWeb/blob/2df36224968a0e489fa385f0aaca91c4875b0707/src/app/app.component.spec.ts) was created to continue verifying similar Mechanisims.

## Development Setup

For development, we recommend using WebStorm, a powerful IDE ideal for JavaScript development. It is free for students and faculty members with a .edu email. You can download it [here](https://www.jetbrains.com/community/education).

### Steps to Set Up the Development Environment

1. **Download & Install WebStorm**: Visit the [WebStorm site](https://www.jetbrains.com/community/education) and download the software. Remember to register with your .edu email to get it for free.

2. **Clone the Repository**: Using WebStorm, clone the PMKS+ repository to your local machine.

3. **Install Node JS**: https://nodejs.org/en/download

3. **Install Dependencies**: The necessary dependencies should automatically install when the repository is cloned. If any dependencies are missing, you can run `npm install` to add them.

4. **Set Up Run Configurations**: Create two run configurations in WebStorm:

    - *First Configuration*: A npm configuration that runs 'npm start'.
    - *Second Configuration*: A JavaScript Debug configuration with the URL set to `http://localhost:4200`. This allows you to run a locally hosted test site on port 4200 and use breakpoints and the debugger to identify errors.

5. **Angular DevTools**: We recommend using the Angular DevTools extension for your browser (available for both [Chrome](https://chrome.google.com/webstore/detail/angular-devtools/ienfalfjdbdpebioblfackkekamfmbnh?hl=en) and [Firefox](https://addons.mozilla.org/en-US/firefox/addon/angular-devtools/)). This tool provides additional functionality for debugging and optimizing your Angular applications.

With these steps, you should have a fully functional development environment for PMKS+. Happy coding!

## Coding Guidelines and Workflow

We encourage high code quality and strive for clean, readable, and maintainable code. Here are some general practices we follow:

1. **Code Purposefully**: Code should be written in a simple, obvious style with descriptive variable and function names. Avoid commenting code to explain _how_ it works; instead, code should be written in a way that is inherently understandable. Use comments to explain _why_—to describe high-level behavior and its importance.

2. **Keep Code Short**: Try to keep classes under 200 lines of code if possible and functions short. This prevents the emergence of "god" classes that can make the codebase difficult to maintain.

3. **Good OOP Practices**: Follow principles like SOLID, DRY, and prefer composition over inheritance. If complex relationships seem necessary, reach out first so we can discuss the best approach.

4. **Follow Programming Conventions**: 
- File names should always be dash-delimited, with dots being used to denote the “type” of the file. For example: `currency-converter.pipe.ts1`
- All service classes should end with the term `Service`. For example: `HeroService1`
- Selectors for your components should always be dash-delimited, like files, and contain the appropriate app prefix. For example: `app-hero-list`
- The name of a component class should end with `Component`. For example: `HeroListComponent`
- The name of a directive class should end with `Directive`. For example: `HighlightDirective`
- The name of a module class should end with `Module`. For example: `AppModule2`. (In practice the app is fully standalone and no longer defines NgModules — prefer a standalone component with its own `imports`.)
- The name of a pipe class should be in `PascalCase` and end with `Pipe`. For example: `CurrencyConverterPipe2`
- For more details, check out [Angular's offical coding style guide](https://angular.io/guide/styleguide).

While the codebase may not always perfectly adhere to these conventions, the aim is to continually improve the codebase to meet these standards.

### Workflow

We follow an agile scrum-style workflow, using an issue tracker (Kanban board) in our GitHub organization [here](https://github.com/orgs/PMKS-Web/projects/1). 

The process is as follows:

1. Create a fork for each issue you work on.
2. Once you've resolved an issue in your fork, submit a pull request to the main branch.

Please note, the main branch has a CI/CD workflow setup that will update the production website, so nothing should be pushed directly to the main branch!

The commits to the main branch will get reflected on [app.pmksplus.com](https://app.pmksplus.com)

All other branches will get published to https://[BRANCHNAME]--pmks.netlify.app (For example https://staging--pmks.netlify.app)

Landing Page: https://pmksplus.com



This project was generated with [Angular CLI](https://github.com/angular/angular-cli), and now runs on Angular 22. It needs Node 22.22 or newer (24.x works).

## Development server

Run `npm start` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

## Tests

Run `npm test -- --watch=false` for the Vitest suite; drop the flag for watch mode.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. The app is fully standalone — there is no `AppModule`, and a new component declares its own `imports` rather than being added to an NgModule.

## Build

Run `npm run build` to build the project. The build artifacts will be stored in `dist/pmksweb`.

## Additional Help Resoruces

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.

## Usage Instructions

PMKS+ features an intuitive interface that allows you to create, edit, and analyze 2D linkages efficiently. 

### Application Interface

PMKS+ is a full-screen grid canvas with a strip of controls across the top, the current mode's panel in the top-left corner, and playback and view controls along the bottom.

- **Top strip**: On the left, a menu button (New Project, Open, Templates, Save, Share Project, Settings, Help / Feedback) beside the PMKS+ logo. In the middle, the four **mode tabs** — Synthesis, Edit, Kinematic Analysis, and Force Analysis. Each analysis tab carries a small status chip saying whether that analysis can run; clicking the chip opens a setup list explaining exactly what is missing and offering to jump to the part at fault. On the right, a card holding Undo and Redo while you are building, which becomes **Export Data** once you are in an analysis mode.

- **Mode panel (top-left)**: Whichever mode is selected shows its panel here — the synthesis form, the properties of the selected joint or link, or that part's analysis graphs. With nothing selected it shows a short hint about what to do next.

- **Playback (bottom)**: A transport card with a playback-speed button, play/pause, and a stop button that eases the mechanism back to the pose it was drawn in. Beside it, a scrubber card with **one row per mechanism** — a drawing can hold several independent machines, and each has its own input direction, angle and time readout, and scrub handle. When there is more than one, a toggle switches between running them all on a shared clock and controlling each separately.

- **View controls (bottom-right)**: Show or hide centres of mass, joint IDs, and traced paths; zoom in, zoom out, and reset the view.

- **Status strip (bottom)**: The current mode, what the mechanism is or is not ready for, the cursor position, and the units in use.

- **Right drawer**: Slides in over the canvas for Settings, Help / Feedback, either analysis's setup list, and the Export Data flow.

### Using the Tool

1. **Build**: Right-click empty grid to add a link or a cylinder. Right-click a joint to attach another link, a cylinder, a tracer point or a force to it, to ground it, to make it the input, to give it a slider, or to weld it. Drag joints to move them.

2. **Edit**: With the Edit tab open, select a joint or link to change its position, length, mass, centre of mass, input speed and direction, or appearance. The linkage can only be modified while the animation is paused at the start pose.

3. **Kinematic Analysis**: Select a joint for its position, velocity and acceleration; select a link for its angle, angular velocity and acceleration, and the same three for its centre of mass.

4. **Force Analysis**: Choose Static (Equilibrium) or In-motion (Dynamic) to see the reaction forces each link carries at a joint and the torque or force the input has to supply. Gravity can be turned off in Settings.

5. **Synthesis**: Generate a four-bar linkage from three desired poses of the coupler.

6. **Export**: In either analysis mode, Export Data walks you through choosing parts, choosing columns, and choosing a format — CSV, Excel, graph images, or a printable report.

7. **Share**: The entire project is encoded in the URL, so Share Project produces a link that reopens exactly what you are looking at. This is also what Undo and Redo are built on.

Only one drawer can be open at a time, and the linkage can only be modified when the animation is paused and reset to the start pose.

## Licensing

PMKS+ is licensed under the [MIT License](https://opensource.org/licenses/MIT), a popular, permissive open-source license. The full license text is included in the LICENSE file in this repository.

## Contact

For any queries, you can reach out to the development team at gr-pmksplus@wpi.edu.

## Acknowledgements

PMKS+ is based on PMKS, developed by Prof. Matthew I. Campbell, Professor, Mechanical Engineering, Oregon State University. 

### Contributors

- Jessica M. Rhodes (BS/MS RBE '25)
- Ansel Chang (CS '25)
- Jacob Adamsky (CS' 24)
- Kohmei Kadoya (BS/MS RBE '23)
- Alex Galvan (BS ME/RBE ’21)
- Haofan Zhang (BS/MS CS ’20)
- Trevor Dowd (BS CS ’20)
- Robert Dutile (BS CS ’20)
- Milap Patel (BS ME/CS ’20)
- Michael Taylor (BS CS ’19)
- Griffin Cecil (BS CS ’19)
- Dimitrios Tsiakmakis (BS CS ’19)
- Praneeth Appikatla (BS CS ’19)

### Faculty

- Prof. David Brown (CS)
- Prof. Pradeep Radhakrishnan (ME, RBE)
