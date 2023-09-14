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
          '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq';
        break;
      case 'Watt_I':
        content =
          '0P.TY.K,0.101.MA,A,0Qh,0Kn,0.GB,B,0e1,9i,0.GC,C,bT,LF,0.GD,D,0G5,tZ,0.GE,E,V5,1_z,0.GF,F,1mM,1Gv,0.KG,G,1rt,0ey,0..YRAB,AB,Fe,Fe,0XM,05Z,c5cae9,A,B,,.YRBCD,BCD,Fe,Fe,06D,Sr,303e9f,B,C,D,,.YRDE,DE,Fe,Fe,7W,1RG,0d125a,D,E,,.YREF,EF,Fe,Fe,17j,1dx,B2DFDB,E,F,,.YRFCG,FCG,Fe,Fe,1PE,KQ,26A69A,F,C,G,,...JAp';
        break;
      case 'Watt_II':
        content =
          '0P.TY.K,0.101.MA,A,0Vf,0Vd,0.GB,B,0mZ,08A,0.GC,C,06Y,LC,0.GD,D,1MR,J2,0.KE,E,rw,0j2,0.GF,F,2ic,ID,0.KG,G,2lk,0Zt,0..YRAB,AB,Fe,Fe,0e6,0Ju,c5cae9,A,B,,.YRBC,BC,Fe,Fe,0RY,6X,303e9f,B,C,,.YRCDE,CDE,Fe,Fe,ic,01d,0d125a,C,D,E,,.YRDF,DF,Fe,Fe,21X,Id,B2DFDB,D,F,,.YRFG,FG,Fe,Fe,2kA,08r,26A69A,F,G,,...JBm';
        break;
      case 'Stephenson_I':
        content =
          '0P.cc.K,0.101.Ma,a,r,0,0.Gb,b,96,1X0,0.Gc,c,1co,R0,0.Gd,d,2N7,2l1,0.Ge,e,4Yl,1T9,0.Gf,f,2zK,xY,0.Kg,g,3tC,0Pw,0..YRabc,abc,Fe,Fe,ba,fM,c5cae9,a,b,c,,.YRbd,bd,Fe,Fe,1G6,280,303e9f,b,d,,.YRde,de,Fe,Fe,3Sx,265,c5cae9,d,e,,.YRefg,efg,Fe,Fe,3oQ,gG,303e9f,e,f,g,,.YRfc,fc,Fe,Fe,2I3,hH,0d125a,f,c,,..j';
        break;
      case 'Stephenson_II':
        break;
      case 'Stephenson_III':
        content =
          '0P.TY.K,0.101.MA,A,0YP,0ce,0.GB,B,0cQ,0FI,0.GC,C,lC,1-,0.KD,D,ow,0U1,0.GE,E,033,D-,0.GF,F,Dc,nj,0.KG,G,1M0,GJ,0..YRAB,AB,Fe,Fe,0aP,0Qz,c5cae9,A,B,,.YRBCE,BCE,Fe,Fe,1w,E,303e9f,B,C,E,,.YRCD,CD,Fe,Fe,n3,0E1,0d125a,C,D,,.YREF,EF,Fe,Fe,5H,Vs,B2DFDB,E,F,,.YRFG,FG,Fe,Fe,np,X0,26A69A,F,G,,...JBe';
        break;
      case 'Slider_Crank':
        content =
          '0P.TY.K,0.101.MA,A,0mA,0c,0.GB,B,0Yt,bK,0.GC,C,il,H-,0.LD,D,il,H-,0..YRAB,AB,Fe,Fe,0fW,IN,c5cae9,A,B,,.YRBC,BC,Fe,Fe,4y,Rf,303e9f,B,C,,.YPCD,CD,Fe,0,0,0,,C,D,,...JAe';
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
