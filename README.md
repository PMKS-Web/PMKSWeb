# Planar Mechanism Kinematic Simulator Plus (PMKS+)

PMKS+ (Planar Mechanism Kinematic Simulator Plus) is an educational web-based tool designed for comprehensive 2D linkage analysis. It offers an interactive platform for users to rapidly create, edit, and analyze planar linkages. Along with performing kinematic and force analysis, PMKS+ allows for easy sharing of linkages with peers or teaching staff.

Built with a strong emphasis on the four core principles of education, flexibility, collaboration, and accessibility, PMKS+ aims to provide a user-friendly experience that aids learning and promotes understanding of complex concepts in a simplified manner.

## Key Features

Interactive Linkage Creation & Editing: Easily create and modify planar linkages with a user-friendly interface.
- Comprehensive Analysis: Perform detailed kinematic and force analysis on your linkages.
- Collaborative Learning Environment: Share your linkages with classmates, peers, or teaching staff for collaborative learning and problem-solving.
- Designed for Education: PMKS+ is developed with a focus on educational use, making complex planar mechanism concepts more approachable and understandable.
- Flexibility & Accessibility: As a web-based tool, PMKS+ can be accessed from anywhere, providing flexibility and convenience to its users.

## Development Setup

For development, we recommend using WebStorm, a powerful IDE ideal for JavaScript development. It is free for students and faculty members with a .edu email. You can download it [here](https://www.jetbrains.com/community/education).

### Steps to Set Up the Development Environment

1. **Download & Install WebStorm**: Visit the [WebStorm site](https://www.jetbrains.com/community/education) and download the software. Remember to register with your .edu email to get it for free.

2. **Clone the Repository**: Using WebStorm, clone the PMKS+ repository to your local machine.

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
    - Always use full type hinting
    - Use snake case for file names
    - Use pascal case for classes
    - Use camel case for functions and variables
    - Top-level multiline comment for classes and comment function headers

While the codebase may not always perfectly adhere to these conventions, the aim is to continually improve the codebase to meet these standards.

### Workflow

We follow an agile scrum-style workflow, using an issue tracker (Kanban board) in our GitHub organization [here](https://github.com/orgs/PMKS-Web/projects/1). 

The process is as follows:

1. Create a fork for each issue you work on.
2. Once you've resolved an issue in your fork, submit a pull request to the main branch.

Please note, the main branch has a CI/CD workflow setup that will update the production website, so nothing should be pushed directly to the main branch!


This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 13.2.5.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Additional Help Resoruces

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.

## Usage Instructions

PMKS+ features an intuitive interface that allows you to create, edit, and analyze 2D linkages efficiently. 

### Application Interface

The PMKS+ interface consists of a full-screen grid with a toolbar at the top and an animation bar at the bottom. 

- **Toolbar**: The toolbar provides quick access to common tasks. It includes a PMKS+ logo, buttons for creating a new project, loading a project, accessing the Linkage Library, downloading the current project, and generating a shareable URL for the current project.

- **Animation Bar**: The animation bar allows users to control the simulation of the linkage animation. It consists of buttons for controlling the playback speed, time control buttons, and buttons for controlling the grid visibility.

- **Side Panels**: On the left, there are three tabs for editing, analyzing, and synthesizing linkages. On the right, there are buttons that open panels for settings, help, and displaying equations.

### Using the Tool

1. **Synthesis**: Use the synthesis tab to automatically generate a linkage based on a desired position for one of the links.

2. **Edit**: When the edit tab is open, you can modify the properties of the selected object (highlighted in amber color).

3. **Analysis**: The analysis panel allows you to view kinematics and force analysis graphs for the selected object.

4. **Settings**: The settings panel enables you to modify overall mechanism settings, such as units, input speed, enabling gravity, as well as visual settings like mechanism size and grid line visibility.

5. **Animation Control**: Use the animation bar to control the playback of the linkage simulation. You can set the playback speed, play or pause the animation, reset the animation to T=0, and seek through the simulation using the scrubber.

6. **File Management**: Use the toolbar buttons to create a new project, load a project, access the Linkage Library, download the current project, and generate a shareable URL for the current project.

Remember, only one tab can be open at a time for each group (left and right), and the linkage can only be modified when the animation is paused and reset to T=0.

## Licensing

PMKS+ is licensed under the [MIT License](https://opensource.org/licenses/MIT), a popular, permissive open-source license. The full license text is included in the LICENSE file in this repository.

## Contact

For any queries, you can reach out to the development team at gr-pmksplus@wpi.edu.

## Acknowledgements

PMKS+ is based on PMKS, developed by Prof. Matthew I. Campbell, Professor, Mechanical Engineering, Oregon State University. 

### Contributors

- Ansel Chang (CS '25)
- Jacob Adamski (CS' 24)
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
