import {
  Component,
  ChangeDetectionStrategy,
  Optional,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MechanismService } from 'src/app/services/mechanism.service';
import { UrlProcessorService } from 'src/app/services/url-processor.service';
import { TemplateID, TEMPLATE_LINKAGES } from './template-linkages';

@Component({
  selector: 'app-templates',
  templateUrl: './templates.component.html',
  styleUrls: ['./templates.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class TemplatesComponent {
  /** Asks whether to replace the linkage already on the grid or open a new tab. */
  @ViewChild('openChoiceDialog') openChoiceDialog!: TemplateRef<unknown>;

  constructor(
    // Optional so the component can also render outside a dialog (tests do).
    @Optional() private dialogRef: MatDialogRef<TemplatesComponent> | null,
    private dialog: MatDialog,
    private mechanismSrv: MechanismService,
    private urlProcessor: UrlProcessorService
  ) {}

  openLinkage(linkage: TemplateID) {
    const content = TEMPLATE_LINKAGES[linkage];

    // An empty grid has nothing to lose, so load right here instead of
    // spawning a tab the user then has to switch to.
    if (this.gridIsEmpty()) {
      this.openHere(content);
      return;
    }

    this.dialog
      .open(this.openChoiceDialog)
      .afterClosed()
      .subscribe((choice) => {
        if (choice === 'replace') {
          this.openHere(content);
        } else if (choice === 'new-tab') {
          this.openInNewTab(content);
        }
      });
  }

  private gridIsEmpty(): boolean {
    return (
      this.mechanismSrv.joints.length === 0 &&
      this.mechanismSrv.links.length === 0 &&
      this.mechanismSrv.forces.length === 0
    );
  }

  private openHere(content: string) {
    // The same in-place rebuild undo/redo uses. Saved to history, so replacing
    // an existing linkage is a single undo away from being taken back.
    this.urlProcessor.updateFromURL(content, true, true, true);
    this.dialogRef?.close();
  }

  private openInNewTab(content: string) {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const port = window.location.port;
    const url = `${protocol}//${hostname}${port ? `:${port}` : ''}${pathname}`;
    const dataURLString = `${url}?${content}`;

    const toolman = document.createElement('a');
    toolman.setAttribute('href', dataURLString);
    toolman.setAttribute('target', '_blank');
    toolman.style.display = 'none';
    document.body.appendChild(toolman);
    toolman.click();
    document.body.removeChild(toolman);
  }
}
