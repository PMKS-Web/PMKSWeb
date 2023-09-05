import { Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-templates',
  templateUrl: './templates.component.html',
  styleUrls: ['./templates.component.scss'],
})
export class TemplatesComponent {
  openLinkage(linkage: string) {
    let content = '';
    switch (linkage) {
      case '4-Bar':
        content =
          '0v.cc.K,0.101.Ma,a,0,0,0.Gb,b,fk,1Jz,0.Gc,c,2o7,1sD,0.Kd,d,3Qm,0,0..YRab,Crank,Fe,Fe,Kt,f_,c5cae9,a,b,,.YRbc,Coupler,Fe,Fe,1jw,1b5,303e9f,b,c,,.YRcd,Follower,Fe,Fe,36R,x6,c5cae9,c,d,,..z';
        break;
      case 'Watt_I':
        content =
          '0P.cc.K,0.101.Ma,a,0,0,0.Gb,b,Sy,1Ih,0.Gc,c,1we,19J,0.Gd,d,17O,2HW,0.Ge,e,31l,3FF,0.Gf,f,417,1ya,0.Kg,g,3h4,Z,0..YRab,ab,Fe,Fe,EU,fM,c5cae9,a,b,,.YRbcd,bcd,Fe,Fe,1AK,1aW,303e9f,b,c,d,,.YRde,de,Fe,Fe,24Z,2mN,c5cae9,d,e,,.YRef,ef,Fe,Fe,3XR,2bv,303e9f,e,f,,.YRfcg,fcg,Fe,Fe,3Cy,129,c5cae9,f,c,g,,..l';
        break;
      case 'Watt_II':
        content =
          '0P.v_.K,0.101.Ma,a,0,0,0.Gb,b,1Jq,1gO,0.Gc,c,0c1,1ab,0.Gd,d,02e_,1jj,0.Ke,e,03B8,0,0.Gf,f,3G9,1uU,0.Kg,g,3B8,0,0..YRabc,abc,Fe,Fe,FH,14-,c5cae9,a,b,c,,.YRcd,cd,Fe,Fe,01dV,1f9,303e9f,c,d,,.YRde,de,Fe,Fe,02w3,st,c5cae9,d,e,,.YRbf,bf,Fe,Fe,2H-,1nR,303e9f,b,f,,.YRfg,fg,Fe,Fe,3De,yF,c5cae9,f,g,,..j';
        break;
      case 'Stephenson_I':
        content =
          '0P.cc.K,0.101.Ma,a,r,0,0.Gb,b,96,1X0,0.Gc,c,1co,R0,0.Gd,d,2N7,2l1,0.Ge,e,4Yl,1T9,0.Gf,f,2zK,xY,0.Kg,g,3tC,0Pw,0..YRabc,abc,Fe,Fe,ba,fM,c5cae9,a,b,c,,.YRbd,bd,Fe,Fe,1G6,280,303e9f,b,d,,.YRde,de,Fe,Fe,3Sx,265,c5cae9,d,e,,.YRefg,efg,Fe,Fe,3oQ,gG,303e9f,e,f,g,,.YRfc,fc,Fe,Fe,2I3,hH,0d125a,f,c,,..j';
        break;
      case 'Stephenson_II':
        break;
      case 'Stephenson_III':
        content =
          '0P.cc.K,0.101.Ma,a,0,0,0.Gb,b,0Av,131,0.Kc,c,1Tm,0,0.Gd,d,1WW,14n,0.Ge,e,Bp,2ih,0.Gf,f,28g,3l2,0.Kg,g,2oa,2ih,0..YRab,ab,Fe,Fe,05T,XX,c5cae9,a,b,,.YRcd,cd,Fe,Fe,1V8,YP,c5cae9,c,d,,.YRdbe,dbe,Fe,Fe,WU,1cq,303e9f,d,b,e,,.YRef,ef,Fe,Fe,1AF,3Ds,c5cae9,e,f,,.YRfg,fg,Fe,Fe,2Td,3Ds,303e9f,f,g,,..g';
        break;
      case 'Slider_Crank':
        content =
          '0v.cc.K,0.101.Ga,a,0,ku,0.Gb,Slider,2Ce,NS,0.Md,d,0,0,0.Le,e,2Ce,NS,0..YRab,ab,Fe,Fe,16K,ZA,c5cae9,a,b,,.YRad,Crank,Fe,Fe,0,NS,303e9f,a,d,,.YPbe,be,Fe,0,0,0,,b,e,,..f';
        break;
      case 'Force':
        content =
          '0v.cc.K,0.101.Ma,a,0,0,0.Gb,b,fk,1Jz,0.Gc,c,2o7,1sD,0.Kd,d,3Qm,0,0..YRab,Crank,Fe,Fe,Kt,f-,c5cae9,a,b,,.YRbc,Coupler,Fe,Fe,1jw,1b5,303e9f,b,c,,.YRcd,Follower,Fe,Fe,36S,x7,c5cae9,c,d,,..2F1,bc,F1,1AR,1SH,1AR,JF,Fe.R';
        break;
    }
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const port = window.location.port;
    const url = `${protocol}//${hostname}${port ? `:${port}` : ''}${pathname}`;
    const dataURLString = `${url}?${content}`;

    console.log(dataURLString);

    const toolman = document.createElement('a');
    toolman.setAttribute('href', dataURLString);
    toolman.setAttribute('target', '_blank');
    toolman.style.display = 'none';
    document.body.appendChild(toolman);
    toolman.click();
    document.body.removeChild(toolman);
  }
}
