import{dr as Jr,ds as Qr}from"./index-B9-71Bqm.js";function vt(){}Object.assign(vt.prototype,{addEventListener:function(e,t){this._listeners===void 0&&(this._listeners={});var i=this._listeners;i[e]===void 0&&(i[e]=[]),i[e].indexOf(t)===-1&&i[e].push(t)},hasEventListener:function(e,t){if(this._listeners===void 0)return!1;var i=this._listeners;return i[e]!==void 0&&i[e].indexOf(t)!==-1},removeEventListener:function(e,t){if(this._listeners!==void 0){var i=this._listeners,r=i[e];if(r!==void 0){var n=r.indexOf(t);n!==-1&&r.splice(n,1)}}},dispatchEvent:function(e){if(this._listeners!==void 0){var t=this._listeners,i=t[e.type];if(i!==void 0){e.target=this;for(var r=i.slice(0),n=0,a=r.length;n<a;n++)r[n].call(this,e)}}}});var Kr=0,Pi=1,$r=2,ar=1,en=2,Qt=0,We=1,Kt=2,tn=1,sr=0,Wt=0,Rt=1,Ci=2,Di=3,Fi=4,rn=5,_t=100,nn=101,an=102,ri=103,ni=104,sn=200,on=201,ln=202,un=203,or=204,lr=205,fn=206,cn=207,hn=208,dn=209,pn=210,mn=0,vn=1,gn=2,oi=3,_n=4,xn=5,yn=6,Mn=7,ur=0,En=1,wn=2,ai=0,fr=1,bn=2,Sn=3,Tn=4,Ln=5,cr=300,hr=301,Ui=302,An=303,Ii=304,Rn=305,dr=306,pr=307,li=1e3,rt=1001,ui=1002,Ge=1003,mr=1004,vr=1005,pt=1006,Pn=1007,gr=1008,$t=1009,Cn=1010,Dn=1011,fi=1012,Fn=1013,_r=1014,Pt=1015,Si=1016,Un=1017,In=1018,Nn=1019,ci=1020,Bn=1021,Xt=1022,ft=1023,On=1024,zn=1025,hi=1026,di=1027,Gn=1028,Ni=33776,Bi=33777,Oi=33778,zi=33779,Gi=35840,Vi=35841,Hi=35842,ki=35843,Vn=36196,Hn=37808,kn=37809,Wn=37810,Xn=37811,qn=37812,Yn=37813,jn=37814,Zn=37815,Jn=37816,Qn=37817,Kn=37818,$n=37819,ea=37820,ta=37821,xr=0,ia=1,ra=2,qt=3e3,na=3001,yr=3007,aa=3002,sa=3004,oa=3005,la=3006,ua=3200,fa=3201,ca=1,xe={DEG2RAD:Math.PI/180,RAD2DEG:180/Math.PI,generateUUID:function(){for(var e=[],t=0;t<256;t++)e[t]=(t<16?"0":"")+t.toString(16);return function(){var r=Math.random()*4294967295|0,n=Math.random()*4294967295|0,a=Math.random()*4294967295|0,s=Math.random()*4294967295|0,o=e[r&255]+e[r>>8&255]+e[r>>16&255]+e[r>>24&255]+"-"+e[n&255]+e[n>>8&255]+"-"+e[n>>16&15|64]+e[n>>24&255]+"-"+e[a&63|128]+e[a>>8&255]+"-"+e[a>>16&255]+e[a>>24&255]+e[s&255]+e[s>>8&255]+e[s>>16&255]+e[s>>24&255];return o.toUpperCase()}}(),clamp:function(e,t,i){return Math.max(t,Math.min(i,e))},euclideanModulo:function(e,t){return(e%t+t)%t},mapLinear:function(e,t,i,r,n){return r+(e-t)*(n-r)/(i-t)},lerp:function(e,t,i){return(1-i)*e+i*t},smoothstep:function(e,t,i){return e<=t?0:e>=i?1:(e=(e-t)/(i-t),e*e*(3-2*e))},smootherstep:function(e,t,i){return e<=t?0:e>=i?1:(e=(e-t)/(i-t),e*e*e*(e*(e*6-15)+10))},randInt:function(e,t){return e+Math.floor(Math.random()*(t-e+1))},randFloat:function(e,t){return e+Math.random()*(t-e)},randFloatSpread:function(e){return e*(.5-Math.random())},degToRad:function(e){return e*xe.DEG2RAD},radToDeg:function(e){return e*xe.RAD2DEG},isPowerOfTwo:function(e){return(e&e-1)===0&&e!==0},ceilPowerOfTwo:function(e){return Math.pow(2,Math.ceil(Math.log(e)/Math.LN2))},floorPowerOfTwo:function(e){return Math.pow(2,Math.floor(Math.log(e)/Math.LN2))}};function de(e,t){this.x=e||0,this.y=t||0}Object.defineProperties(de.prototype,{width:{get:function(){return this.x},set:function(e){this.x=e}},height:{get:function(){return this.y},set:function(e){this.y=e}}});Object.assign(de.prototype,{isVector2:!0,set:function(e,t){return this.x=e,this.y=t,this},setScalar:function(e){return this.x=e,this.y=e,this},setX:function(e){return this.x=e,this},setY:function(e){return this.y=e,this},setComponent:function(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("index is out of range: "+e)}return this},getComponent:function(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+e)}},clone:function(){return new this.constructor(this.x,this.y)},copy:function(e){return this.x=e.x,this.y=e.y,this},add:function(e,t){return t!==void 0?(console.warn("THREE.Vector2: .add() now only accepts one argument. Use .addVectors( a, b ) instead."),this.addVectors(e,t)):(this.x+=e.x,this.y+=e.y,this)},addScalar:function(e){return this.x+=e,this.y+=e,this},addVectors:function(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this},addScaledVector:function(e,t){return this.x+=e.x*t,this.y+=e.y*t,this},sub:function(e,t){return t!==void 0?(console.warn("THREE.Vector2: .sub() now only accepts one argument. Use .subVectors( a, b ) instead."),this.subVectors(e,t)):(this.x-=e.x,this.y-=e.y,this)},subScalar:function(e){return this.x-=e,this.y-=e,this},subVectors:function(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this},multiply:function(e){return this.x*=e.x,this.y*=e.y,this},multiplyScalar:function(e){return this.x*=e,this.y*=e,this},divide:function(e){return this.x/=e.x,this.y/=e.y,this},divideScalar:function(e){return this.multiplyScalar(1/e)},applyMatrix3:function(e){var t=this.x,i=this.y,r=e.elements;return this.x=r[0]*t+r[3]*i+r[6],this.y=r[1]*t+r[4]*i+r[7],this},min:function(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this},max:function(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this},clamp:function(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this},clampScalar:function(){var e=new de,t=new de;return function(r,n){return e.set(r,r),t.set(n,n),this.clamp(e,t)}}(),clampLength:function(e,t){var i=this.length();return this.divideScalar(i||1).multiplyScalar(Math.max(e,Math.min(t,i)))},floor:function(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this},ceil:function(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this},round:function(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this},roundToZero:function(){return this.x=this.x<0?Math.ceil(this.x):Math.floor(this.x),this.y=this.y<0?Math.ceil(this.y):Math.floor(this.y),this},negate:function(){return this.x=-this.x,this.y=-this.y,this},dot:function(e){return this.x*e.x+this.y*e.y},cross:function(e){return this.x*e.y-this.y*e.x},lengthSq:function(){return this.x*this.x+this.y*this.y},length:function(){return Math.sqrt(this.x*this.x+this.y*this.y)},manhattanLength:function(){return Math.abs(this.x)+Math.abs(this.y)},normalize:function(){return this.divideScalar(this.length()||1)},angle:function(){var e=Math.atan2(this.y,this.x);return e<0&&(e+=2*Math.PI),e},distanceTo:function(e){return Math.sqrt(this.distanceToSquared(e))},distanceToSquared:function(e){var t=this.x-e.x,i=this.y-e.y;return t*t+i*i},manhattanDistanceTo:function(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)},setLength:function(e){return this.normalize().multiplyScalar(e)},lerp:function(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this},lerpVectors:function(e,t,i){return this.subVectors(t,e).multiplyScalar(i).add(e)},equals:function(e){return e.x===this.x&&e.y===this.y},fromArray:function(e,t){return t===void 0&&(t=0),this.x=e[t],this.y=e[t+1],this},toArray:function(e,t){return e===void 0&&(e=[]),t===void 0&&(t=0),e[t]=this.x,e[t+1]=this.y,e},fromBufferAttribute:function(e,t,i){return i!==void 0&&console.warn("THREE.Vector2: offset has been removed from .fromBufferAttribute()."),this.x=e.getX(t),this.y=e.getY(t),this},rotateAround:function(e,t){var i=Math.cos(t),r=Math.sin(t),n=this.x-e.x,a=this.y-e.y;return this.x=n*i-a*r+e.x,this.y=n*r+a*i+e.y,this}});function pe(){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],arguments.length>0&&console.error("THREE.Matrix4: the constructor no longer reads arguments. use .set() instead.")}Object.assign(pe.prototype,{isMatrix4:!0,set:function(e,t,i,r,n,a,s,o,u,l,f,c,h,p,v,_){var M=this.elements;return M[0]=e,M[4]=t,M[8]=i,M[12]=r,M[1]=n,M[5]=a,M[9]=s,M[13]=o,M[2]=u,M[6]=l,M[10]=f,M[14]=c,M[3]=h,M[7]=p,M[11]=v,M[15]=_,this},identity:function(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this},clone:function(){return new pe().fromArray(this.elements)},copy:function(e){var t=this.elements,i=e.elements;return t[0]=i[0],t[1]=i[1],t[2]=i[2],t[3]=i[3],t[4]=i[4],t[5]=i[5],t[6]=i[6],t[7]=i[7],t[8]=i[8],t[9]=i[9],t[10]=i[10],t[11]=i[11],t[12]=i[12],t[13]=i[13],t[14]=i[14],t[15]=i[15],this},copyPosition:function(e){var t=this.elements,i=e.elements;return t[12]=i[12],t[13]=i[13],t[14]=i[14],this},extractBasis:function(e,t,i){return e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),i.setFromMatrixColumn(this,2),this},makeBasis:function(e,t,i){return this.set(e.x,t.x,i.x,0,e.y,t.y,i.y,0,e.z,t.z,i.z,0,0,0,0,1),this},extractRotation:function(){var e=new T;return function(i){var r=this.elements,n=i.elements,a=1/e.setFromMatrixColumn(i,0).length(),s=1/e.setFromMatrixColumn(i,1).length(),o=1/e.setFromMatrixColumn(i,2).length();return r[0]=n[0]*a,r[1]=n[1]*a,r[2]=n[2]*a,r[3]=0,r[4]=n[4]*s,r[5]=n[5]*s,r[6]=n[6]*s,r[7]=0,r[8]=n[8]*o,r[9]=n[9]*o,r[10]=n[10]*o,r[11]=0,r[12]=0,r[13]=0,r[14]=0,r[15]=1,this}}(),makeRotationFromEuler:function(e){e&&e.isEuler||console.error("THREE.Matrix4: .makeRotationFromEuler() now expects a Euler rotation rather than a Vector3 and order.");var t=this.elements,i=e.x,r=e.y,n=e.z,a=Math.cos(i),s=Math.sin(i),o=Math.cos(r),u=Math.sin(r),l=Math.cos(n),f=Math.sin(n);if(e.order==="XYZ"){var c=a*l,h=a*f,p=s*l,v=s*f;t[0]=o*l,t[4]=-o*f,t[8]=u,t[1]=h+p*u,t[5]=c-v*u,t[9]=-s*o,t[2]=v-c*u,t[6]=p+h*u,t[10]=a*o}else if(e.order==="YXZ"){var _=o*l,M=o*f,w=u*l,S=u*f;t[0]=_+S*s,t[4]=w*s-M,t[8]=a*u,t[1]=a*f,t[5]=a*l,t[9]=-s,t[2]=M*s-w,t[6]=S+_*s,t[10]=a*o}else if(e.order==="ZXY"){var _=o*l,M=o*f,w=u*l,S=u*f;t[0]=_-S*s,t[4]=-a*f,t[8]=w+M*s,t[1]=M+w*s,t[5]=a*l,t[9]=S-_*s,t[2]=-a*u,t[6]=s,t[10]=a*o}else if(e.order==="ZYX"){var c=a*l,h=a*f,p=s*l,v=s*f;t[0]=o*l,t[4]=p*u-h,t[8]=c*u+v,t[1]=o*f,t[5]=v*u+c,t[9]=h*u-p,t[2]=-u,t[6]=s*o,t[10]=a*o}else if(e.order==="YZX"){var L=a*o,b=a*u,R=s*o,P=s*u;t[0]=o*l,t[4]=P-L*f,t[8]=R*f+b,t[1]=f,t[5]=a*l,t[9]=-s*l,t[2]=-u*l,t[6]=b*f+R,t[10]=L-P*f}else if(e.order==="XZY"){var L=a*o,b=a*u,R=s*o,P=s*u;t[0]=o*l,t[4]=-f,t[8]=u*l,t[1]=L*f+P,t[5]=a*l,t[9]=b*f-R,t[2]=R*f-b,t[6]=s*l,t[10]=P*f+L}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this},makeRotationFromQuaternion:function(){var e=new T(0,0,0),t=new T(1,1,1);return function(r){return this.compose(e,r,t)}}(),lookAt:function(){var e=new T,t=new T,i=new T;return function(n,a,s){var o=this.elements;return i.subVectors(n,a),i.lengthSq()===0&&(i.z=1),i.normalize(),e.crossVectors(s,i),e.lengthSq()===0&&(Math.abs(s.z)===1?i.x+=1e-4:i.z+=1e-4,i.normalize(),e.crossVectors(s,i)),e.normalize(),t.crossVectors(i,e),o[0]=e.x,o[4]=t.x,o[8]=i.x,o[1]=e.y,o[5]=t.y,o[9]=i.y,o[2]=e.z,o[6]=t.z,o[10]=i.z,this}}(),multiply:function(e,t){return t!==void 0?(console.warn("THREE.Matrix4: .multiply() now only accepts one argument. Use .multiplyMatrices( a, b ) instead."),this.multiplyMatrices(e,t)):this.multiplyMatrices(this,e)},premultiply:function(e){return this.multiplyMatrices(e,this)},multiplyMatrices:function(e,t){var i=e.elements,r=t.elements,n=this.elements,a=i[0],s=i[4],o=i[8],u=i[12],l=i[1],f=i[5],c=i[9],h=i[13],p=i[2],v=i[6],_=i[10],M=i[14],w=i[3],S=i[7],L=i[11],b=i[15],R=r[0],P=r[4],U=r[8],D=r[12],A=r[1],F=r[5],N=r[9],H=r[13],z=r[2],k=r[6],q=r[10],Q=r[14],K=r[3],X=r[7],g=r[11],x=r[15];return n[0]=a*R+s*A+o*z+u*K,n[4]=a*P+s*F+o*k+u*X,n[8]=a*U+s*N+o*q+u*g,n[12]=a*D+s*H+o*Q+u*x,n[1]=l*R+f*A+c*z+h*K,n[5]=l*P+f*F+c*k+h*X,n[9]=l*U+f*N+c*q+h*g,n[13]=l*D+f*H+c*Q+h*x,n[2]=p*R+v*A+_*z+M*K,n[6]=p*P+v*F+_*k+M*X,n[10]=p*U+v*N+_*q+M*g,n[14]=p*D+v*H+_*Q+M*x,n[3]=w*R+S*A+L*z+b*K,n[7]=w*P+S*F+L*k+b*X,n[11]=w*U+S*N+L*q+b*g,n[15]=w*D+S*H+L*Q+b*x,this},multiplyScalar:function(e){var t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this},applyToBufferAttribute:function(){var e=new T;return function(i){for(var r=0,n=i.count;r<n;r++)e.x=i.getX(r),e.y=i.getY(r),e.z=i.getZ(r),e.applyMatrix4(this),i.setXYZ(r,e.x,e.y,e.z);return i}}(),determinant:function(){var e=this.elements,t=e[0],i=e[4],r=e[8],n=e[12],a=e[1],s=e[5],o=e[9],u=e[13],l=e[2],f=e[6],c=e[10],h=e[14],p=e[3],v=e[7],_=e[11],M=e[15];return p*(+n*o*f-r*u*f-n*s*c+i*u*c+r*s*h-i*o*h)+v*(+t*o*h-t*u*c+n*a*c-r*a*h+r*u*l-n*o*l)+_*(+t*u*f-t*s*h-n*a*f+i*a*h+n*s*l-i*u*l)+M*(-r*s*l-t*o*f+t*s*c+r*a*f-i*a*c+i*o*l)},transpose:function(){var e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this},setPosition:function(e){var t=this.elements;return t[12]=e.x,t[13]=e.y,t[14]=e.z,this},getInverse:function(e,t){var i=this.elements,r=e.elements,n=r[0],a=r[1],s=r[2],o=r[3],u=r[4],l=r[5],f=r[6],c=r[7],h=r[8],p=r[9],v=r[10],_=r[11],M=r[12],w=r[13],S=r[14],L=r[15],b=p*S*c-w*v*c+w*f*_-l*S*_-p*f*L+l*v*L,R=M*v*c-h*S*c-M*f*_+u*S*_+h*f*L-u*v*L,P=h*w*c-M*p*c+M*l*_-u*w*_-h*l*L+u*p*L,U=M*p*f-h*w*f-M*l*v+u*w*v+h*l*S-u*p*S,D=n*b+a*R+s*P+o*U;if(D===0){var A="THREE.Matrix4: .getInverse() can't invert matrix, determinant is 0";if(t===!0)throw new Error(A);return console.warn(A),this.identity()}var F=1/D;return i[0]=b*F,i[1]=(w*v*o-p*S*o-w*s*_+a*S*_+p*s*L-a*v*L)*F,i[2]=(l*S*o-w*f*o+w*s*c-a*S*c-l*s*L+a*f*L)*F,i[3]=(p*f*o-l*v*o-p*s*c+a*v*c+l*s*_-a*f*_)*F,i[4]=R*F,i[5]=(h*S*o-M*v*o+M*s*_-n*S*_-h*s*L+n*v*L)*F,i[6]=(M*f*o-u*S*o-M*s*c+n*S*c+u*s*L-n*f*L)*F,i[7]=(u*v*o-h*f*o+h*s*c-n*v*c-u*s*_+n*f*_)*F,i[8]=P*F,i[9]=(M*p*o-h*w*o-M*a*_+n*w*_+h*a*L-n*p*L)*F,i[10]=(u*w*o-M*l*o+M*a*c-n*w*c-u*a*L+n*l*L)*F,i[11]=(h*l*o-u*p*o-h*a*c+n*p*c+u*a*_-n*l*_)*F,i[12]=U*F,i[13]=(h*w*s-M*p*s+M*a*v-n*w*v-h*a*S+n*p*S)*F,i[14]=(M*l*s-u*w*s-M*a*f+n*w*f+u*a*S-n*l*S)*F,i[15]=(u*p*s-h*l*s+h*a*f-n*p*f-u*a*v+n*l*v)*F,this},scale:function(e){var t=this.elements,i=e.x,r=e.y,n=e.z;return t[0]*=i,t[4]*=r,t[8]*=n,t[1]*=i,t[5]*=r,t[9]*=n,t[2]*=i,t[6]*=r,t[10]*=n,t[3]*=i,t[7]*=r,t[11]*=n,this},getMaxScaleOnAxis:function(){var e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],i=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],r=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,i,r))},makeTranslation:function(e,t,i){return this.set(1,0,0,e,0,1,0,t,0,0,1,i,0,0,0,1),this},makeRotationX:function(e){var t=Math.cos(e),i=Math.sin(e);return this.set(1,0,0,0,0,t,-i,0,0,i,t,0,0,0,0,1),this},makeRotationY:function(e){var t=Math.cos(e),i=Math.sin(e);return this.set(t,0,i,0,0,1,0,0,-i,0,t,0,0,0,0,1),this},makeRotationZ:function(e){var t=Math.cos(e),i=Math.sin(e);return this.set(t,-i,0,0,i,t,0,0,0,0,1,0,0,0,0,1),this},makeRotationAxis:function(e,t){var i=Math.cos(t),r=Math.sin(t),n=1-i,a=e.x,s=e.y,o=e.z,u=n*a,l=n*s;return this.set(u*a+i,u*s-r*o,u*o+r*s,0,u*s+r*o,l*s+i,l*o-r*a,0,u*o-r*s,l*o+r*a,n*o*o+i,0,0,0,0,1),this},makeScale:function(e,t,i){return this.set(e,0,0,0,0,t,0,0,0,0,i,0,0,0,0,1),this},makeShear:function(e,t,i){return this.set(1,t,i,0,e,1,i,0,e,t,1,0,0,0,0,1),this},compose:function(e,t,i){var r=this.elements,n=t._x,a=t._y,s=t._z,o=t._w,u=n+n,l=a+a,f=s+s,c=n*u,h=n*l,p=n*f,v=a*l,_=a*f,M=s*f,w=o*u,S=o*l,L=o*f,b=i.x,R=i.y,P=i.z;return r[0]=(1-(v+M))*b,r[1]=(h+L)*b,r[2]=(p-S)*b,r[3]=0,r[4]=(h-L)*R,r[5]=(1-(c+M))*R,r[6]=(_+w)*R,r[7]=0,r[8]=(p+S)*P,r[9]=(_-w)*P,r[10]=(1-(c+v))*P,r[11]=0,r[12]=e.x,r[13]=e.y,r[14]=e.z,r[15]=1,this},decompose:function(){var e=new T,t=new pe;return function(r,n,a){var s=this.elements,o=e.set(s[0],s[1],s[2]).length(),u=e.set(s[4],s[5],s[6]).length(),l=e.set(s[8],s[9],s[10]).length(),f=this.determinant();f<0&&(o=-o),r.x=s[12],r.y=s[13],r.z=s[14],t.copy(this);var c=1/o,h=1/u,p=1/l;return t.elements[0]*=c,t.elements[1]*=c,t.elements[2]*=c,t.elements[4]*=h,t.elements[5]*=h,t.elements[6]*=h,t.elements[8]*=p,t.elements[9]*=p,t.elements[10]*=p,n.setFromRotationMatrix(t),a.x=o,a.y=u,a.z=l,this}}(),makePerspective:function(e,t,i,r,n,a){a===void 0&&console.warn("THREE.Matrix4: .makePerspective() has been redefined and has a new signature. Please check the docs.");var s=this.elements,o=2*n/(t-e),u=2*n/(i-r),l=(t+e)/(t-e),f=(i+r)/(i-r),c=-(a+n)/(a-n),h=-2*a*n/(a-n);return s[0]=o,s[4]=0,s[8]=l,s[12]=0,s[1]=0,s[5]=u,s[9]=f,s[13]=0,s[2]=0,s[6]=0,s[10]=c,s[14]=h,s[3]=0,s[7]=0,s[11]=-1,s[15]=0,this},makeOrthographic:function(e,t,i,r,n,a){var s=this.elements,o=1/(t-e),u=1/(i-r),l=1/(a-n),f=(t+e)*o,c=(i+r)*u,h=(a+n)*l;return s[0]=2*o,s[4]=0,s[8]=0,s[12]=-f,s[1]=0,s[5]=2*u,s[9]=0,s[13]=-c,s[2]=0,s[6]=0,s[10]=-2*l,s[14]=-h,s[3]=0,s[7]=0,s[11]=0,s[15]=1,this},equals:function(e){for(var t=this.elements,i=e.elements,r=0;r<16;r++)if(t[r]!==i[r])return!1;return!0},fromArray:function(e,t){t===void 0&&(t=0);for(var i=0;i<16;i++)this.elements[i]=e[i+t];return this},toArray:function(e,t){e===void 0&&(e=[]),t===void 0&&(t=0);var i=this.elements;return e[t]=i[0],e[t+1]=i[1],e[t+2]=i[2],e[t+3]=i[3],e[t+4]=i[4],e[t+5]=i[5],e[t+6]=i[6],e[t+7]=i[7],e[t+8]=i[8],e[t+9]=i[9],e[t+10]=i[10],e[t+11]=i[11],e[t+12]=i[12],e[t+13]=i[13],e[t+14]=i[14],e[t+15]=i[15],e}});function Xe(e,t,i,r){this._x=e||0,this._y=t||0,this._z=i||0,this._w=r!==void 0?r:1}Object.assign(Xe,{slerp:function(e,t,i,r){return i.copy(e).slerp(t,r)},slerpFlat:function(e,t,i,r,n,a,s){var o=i[r+0],u=i[r+1],l=i[r+2],f=i[r+3],c=n[a+0],h=n[a+1],p=n[a+2],v=n[a+3];if(f!==v||o!==c||u!==h||l!==p){var _=1-s,M=o*c+u*h+l*p+f*v,w=M>=0?1:-1,S=1-M*M;if(S>Number.EPSILON){var L=Math.sqrt(S),b=Math.atan2(L,M*w);_=Math.sin(_*b)/L,s=Math.sin(s*b)/L}var R=s*w;if(o=o*_+c*R,u=u*_+h*R,l=l*_+p*R,f=f*_+v*R,_===1-s){var P=1/Math.sqrt(o*o+u*u+l*l+f*f);o*=P,u*=P,l*=P,f*=P}}e[t]=o,e[t+1]=u,e[t+2]=l,e[t+3]=f}});Object.defineProperties(Xe.prototype,{x:{get:function(){return this._x},set:function(e){this._x=e,this.onChangeCallback()}},y:{get:function(){return this._y},set:function(e){this._y=e,this.onChangeCallback()}},z:{get:function(){return this._z},set:function(e){this._z=e,this.onChangeCallback()}},w:{get:function(){return this._w},set:function(e){this._w=e,this.onChangeCallback()}}});Object.assign(Xe.prototype,{isQuaternion:!0,set:function(e,t,i,r){return this._x=e,this._y=t,this._z=i,this._w=r,this.onChangeCallback(),this},clone:function(){return new this.constructor(this._x,this._y,this._z,this._w)},copy:function(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this.onChangeCallback(),this},setFromEuler:function(e,t){if(!(e&&e.isEuler))throw new Error("THREE.Quaternion: .setFromEuler() now expects an Euler rotation rather than a Vector3 and order.");var i=e._x,r=e._y,n=e._z,a=e.order,s=Math.cos,o=Math.sin,u=s(i/2),l=s(r/2),f=s(n/2),c=o(i/2),h=o(r/2),p=o(n/2);return a==="XYZ"?(this._x=c*l*f+u*h*p,this._y=u*h*f-c*l*p,this._z=u*l*p+c*h*f,this._w=u*l*f-c*h*p):a==="YXZ"?(this._x=c*l*f+u*h*p,this._y=u*h*f-c*l*p,this._z=u*l*p-c*h*f,this._w=u*l*f+c*h*p):a==="ZXY"?(this._x=c*l*f-u*h*p,this._y=u*h*f+c*l*p,this._z=u*l*p+c*h*f,this._w=u*l*f-c*h*p):a==="ZYX"?(this._x=c*l*f-u*h*p,this._y=u*h*f+c*l*p,this._z=u*l*p-c*h*f,this._w=u*l*f+c*h*p):a==="YZX"?(this._x=c*l*f+u*h*p,this._y=u*h*f+c*l*p,this._z=u*l*p-c*h*f,this._w=u*l*f-c*h*p):a==="XZY"&&(this._x=c*l*f-u*h*p,this._y=u*h*f-c*l*p,this._z=u*l*p+c*h*f,this._w=u*l*f+c*h*p),t!==!1&&this.onChangeCallback(),this},setFromAxisAngle:function(e,t){var i=t/2,r=Math.sin(i);return this._x=e.x*r,this._y=e.y*r,this._z=e.z*r,this._w=Math.cos(i),this.onChangeCallback(),this},setFromRotationMatrix:function(e){var t=e.elements,i=t[0],r=t[4],n=t[8],a=t[1],s=t[5],o=t[9],u=t[2],l=t[6],f=t[10],c=i+s+f,h;return c>0?(h=.5/Math.sqrt(c+1),this._w=.25/h,this._x=(l-o)*h,this._y=(n-u)*h,this._z=(a-r)*h):i>s&&i>f?(h=2*Math.sqrt(1+i-s-f),this._w=(l-o)/h,this._x=.25*h,this._y=(r+a)/h,this._z=(n+u)/h):s>f?(h=2*Math.sqrt(1+s-i-f),this._w=(n-u)/h,this._x=(r+a)/h,this._y=.25*h,this._z=(o+l)/h):(h=2*Math.sqrt(1+f-i-s),this._w=(a-r)/h,this._x=(n+u)/h,this._y=(o+l)/h,this._z=.25*h),this.onChangeCallback(),this},setFromUnitVectors:function(){var e=new T,t,i=1e-6;return function(n,a){return e===void 0&&(e=new T),t=n.dot(a)+1,t<i?(t=0,Math.abs(n.x)>Math.abs(n.z)?e.set(-n.y,n.x,0):e.set(0,-n.z,n.y)):e.crossVectors(n,a),this._x=e.x,this._y=e.y,this._z=e.z,this._w=t,this.normalize()}}(),angleTo:function(e){return 2*Math.acos(Math.abs(xe.clamp(this.dot(e),-1,1)))},rotateTowards:function(e,t){var i=this.angleTo(e);if(i===0)return this;var r=Math.min(1,t/i);return this.slerp(e,r),this},inverse:function(){return this.conjugate()},conjugate:function(){return this._x*=-1,this._y*=-1,this._z*=-1,this.onChangeCallback(),this},dot:function(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w},lengthSq:function(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w},length:function(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)},normalize:function(){var e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this.onChangeCallback(),this},multiply:function(e,t){return t!==void 0?(console.warn("THREE.Quaternion: .multiply() now only accepts one argument. Use .multiplyQuaternions( a, b ) instead."),this.multiplyQuaternions(e,t)):this.multiplyQuaternions(this,e)},premultiply:function(e){return this.multiplyQuaternions(e,this)},multiplyQuaternions:function(e,t){var i=e._x,r=e._y,n=e._z,a=e._w,s=t._x,o=t._y,u=t._z,l=t._w;return this._x=i*l+a*s+r*u-n*o,this._y=r*l+a*o+n*s-i*u,this._z=n*l+a*u+i*o-r*s,this._w=a*l-i*s-r*o-n*u,this.onChangeCallback(),this},slerp:function(e,t){if(t===0)return this;if(t===1)return this.copy(e);var i=this._x,r=this._y,n=this._z,a=this._w,s=a*e._w+i*e._x+r*e._y+n*e._z;if(s<0?(this._w=-e._w,this._x=-e._x,this._y=-e._y,this._z=-e._z,s=-s):this.copy(e),s>=1)return this._w=a,this._x=i,this._y=r,this._z=n,this;var o=1-s*s;if(o<=Number.EPSILON){var u=1-t;return this._w=u*a+t*this._w,this._x=u*i+t*this._x,this._y=u*r+t*this._y,this._z=u*n+t*this._z,this.normalize()}var l=Math.sqrt(o),f=Math.atan2(l,s),c=Math.sin((1-t)*f)/l,h=Math.sin(t*f)/l;return this._w=a*c+this._w*h,this._x=i*c+this._x*h,this._y=r*c+this._y*h,this._z=n*c+this._z*h,this.onChangeCallback(),this},equals:function(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w},fromArray:function(e,t){return t===void 0&&(t=0),this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this.onChangeCallback(),this},toArray:function(e,t){return e===void 0&&(e=[]),t===void 0&&(t=0),e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e},onChange:function(e){return this.onChangeCallback=e,this},onChangeCallback:function(){}});function T(e,t,i){this.x=e||0,this.y=t||0,this.z=i||0}Object.assign(T.prototype,{isVector3:!0,set:function(e,t,i){return this.x=e,this.y=t,this.z=i,this},setScalar:function(e){return this.x=e,this.y=e,this.z=e,this},setX:function(e){return this.x=e,this},setY:function(e){return this.y=e,this},setZ:function(e){return this.z=e,this},setComponent:function(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("index is out of range: "+e)}return this},getComponent:function(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+e)}},clone:function(){return new this.constructor(this.x,this.y,this.z)},copy:function(e){return this.x=e.x,this.y=e.y,this.z=e.z,this},add:function(e,t){return t!==void 0?(console.warn("THREE.Vector3: .add() now only accepts one argument. Use .addVectors( a, b ) instead."),this.addVectors(e,t)):(this.x+=e.x,this.y+=e.y,this.z+=e.z,this)},addScalar:function(e){return this.x+=e,this.y+=e,this.z+=e,this},addVectors:function(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this},addScaledVector:function(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this},sub:function(e,t){return t!==void 0?(console.warn("THREE.Vector3: .sub() now only accepts one argument. Use .subVectors( a, b ) instead."),this.subVectors(e,t)):(this.x-=e.x,this.y-=e.y,this.z-=e.z,this)},subScalar:function(e){return this.x-=e,this.y-=e,this.z-=e,this},subVectors:function(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this},multiply:function(e,t){return t!==void 0?(console.warn("THREE.Vector3: .multiply() now only accepts one argument. Use .multiplyVectors( a, b ) instead."),this.multiplyVectors(e,t)):(this.x*=e.x,this.y*=e.y,this.z*=e.z,this)},multiplyScalar:function(e){return this.x*=e,this.y*=e,this.z*=e,this},multiplyVectors:function(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this},applyEuler:function(){var e=new Xe;return function(i){return i&&i.isEuler||console.error("THREE.Vector3: .applyEuler() now expects an Euler rotation rather than a Vector3 and order."),this.applyQuaternion(e.setFromEuler(i))}}(),applyAxisAngle:function(){var e=new Xe;return function(i,r){return this.applyQuaternion(e.setFromAxisAngle(i,r))}}(),applyMatrix3:function(e){var t=this.x,i=this.y,r=this.z,n=e.elements;return this.x=n[0]*t+n[3]*i+n[6]*r,this.y=n[1]*t+n[4]*i+n[7]*r,this.z=n[2]*t+n[5]*i+n[8]*r,this},applyMatrix4:function(e){var t=this.x,i=this.y,r=this.z,n=e.elements,a=1/(n[3]*t+n[7]*i+n[11]*r+n[15]);return this.x=(n[0]*t+n[4]*i+n[8]*r+n[12])*a,this.y=(n[1]*t+n[5]*i+n[9]*r+n[13])*a,this.z=(n[2]*t+n[6]*i+n[10]*r+n[14])*a,this},applyQuaternion:function(e){var t=this.x,i=this.y,r=this.z,n=e.x,a=e.y,s=e.z,o=e.w,u=o*t+a*r-s*i,l=o*i+s*t-n*r,f=o*r+n*i-a*t,c=-n*t-a*i-s*r;return this.x=u*o+c*-n+l*-s-f*-a,this.y=l*o+c*-a+f*-n-u*-s,this.z=f*o+c*-s+u*-a-l*-n,this},project:function(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)},unproject:function(){var e=new pe;return function(i){return this.applyMatrix4(e.getInverse(i.projectionMatrix)).applyMatrix4(i.matrixWorld)}}(),transformDirection:function(e){var t=this.x,i=this.y,r=this.z,n=e.elements;return this.x=n[0]*t+n[4]*i+n[8]*r,this.y=n[1]*t+n[5]*i+n[9]*r,this.z=n[2]*t+n[6]*i+n[10]*r,this.normalize()},divide:function(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this},divideScalar:function(e){return this.multiplyScalar(1/e)},min:function(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this},max:function(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this},clamp:function(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this.z=Math.max(e.z,Math.min(t.z,this.z)),this},clampScalar:function(){var e=new T,t=new T;return function(r,n){return e.set(r,r,r),t.set(n,n,n),this.clamp(e,t)}}(),clampLength:function(e,t){var i=this.length();return this.divideScalar(i||1).multiplyScalar(Math.max(e,Math.min(t,i)))},floor:function(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this},ceil:function(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this},round:function(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this},roundToZero:function(){return this.x=this.x<0?Math.ceil(this.x):Math.floor(this.x),this.y=this.y<0?Math.ceil(this.y):Math.floor(this.y),this.z=this.z<0?Math.ceil(this.z):Math.floor(this.z),this},negate:function(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this},dot:function(e){return this.x*e.x+this.y*e.y+this.z*e.z},lengthSq:function(){return this.x*this.x+this.y*this.y+this.z*this.z},length:function(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)},manhattanLength:function(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)},normalize:function(){return this.divideScalar(this.length()||1)},setLength:function(e){return this.normalize().multiplyScalar(e)},lerp:function(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this},lerpVectors:function(e,t,i){return this.subVectors(t,e).multiplyScalar(i).add(e)},cross:function(e,t){return t!==void 0?(console.warn("THREE.Vector3: .cross() now only accepts one argument. Use .crossVectors( a, b ) instead."),this.crossVectors(e,t)):this.crossVectors(this,e)},crossVectors:function(e,t){var i=e.x,r=e.y,n=e.z,a=t.x,s=t.y,o=t.z;return this.x=r*o-n*s,this.y=n*a-i*o,this.z=i*s-r*a,this},projectOnVector:function(e){var t=e.dot(this)/e.lengthSq();return this.copy(e).multiplyScalar(t)},projectOnPlane:function(){var e=new T;return function(i){return e.copy(this).projectOnVector(i),this.sub(e)}}(),reflect:function(){var e=new T;return function(i){return this.sub(e.copy(i).multiplyScalar(2*this.dot(i)))}}(),angleTo:function(e){var t=this.dot(e)/Math.sqrt(this.lengthSq()*e.lengthSq());return Math.acos(xe.clamp(t,-1,1))},distanceTo:function(e){return Math.sqrt(this.distanceToSquared(e))},distanceToSquared:function(e){var t=this.x-e.x,i=this.y-e.y,r=this.z-e.z;return t*t+i*i+r*r},manhattanDistanceTo:function(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)},setFromSpherical:function(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)},setFromSphericalCoords:function(e,t,i){var r=Math.sin(t)*e;return this.x=r*Math.sin(i),this.y=Math.cos(t)*e,this.z=r*Math.cos(i),this},setFromCylindrical:function(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)},setFromCylindricalCoords:function(e,t,i){return this.x=e*Math.sin(t),this.y=i,this.z=e*Math.cos(t),this},setFromMatrixPosition:function(e){var t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this},setFromMatrixScale:function(e){var t=this.setFromMatrixColumn(e,0).length(),i=this.setFromMatrixColumn(e,1).length(),r=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=i,this.z=r,this},setFromMatrixColumn:function(e,t){return this.fromArray(e.elements,t*4)},equals:function(e){return e.x===this.x&&e.y===this.y&&e.z===this.z},fromArray:function(e,t){return t===void 0&&(t=0),this.x=e[t],this.y=e[t+1],this.z=e[t+2],this},toArray:function(e,t){return e===void 0&&(e=[]),t===void 0&&(t=0),e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e},fromBufferAttribute:function(e,t,i){return i!==void 0&&console.warn("THREE.Vector3: offset has been removed from .fromBufferAttribute()."),this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}});function je(){this.elements=[1,0,0,0,1,0,0,0,1],arguments.length>0&&console.error("THREE.Matrix3: the constructor no longer reads arguments. use .set() instead.")}Object.assign(je.prototype,{isMatrix3:!0,set:function(e,t,i,r,n,a,s,o,u){var l=this.elements;return l[0]=e,l[1]=r,l[2]=s,l[3]=t,l[4]=n,l[5]=o,l[6]=i,l[7]=a,l[8]=u,this},identity:function(){return this.set(1,0,0,0,1,0,0,0,1),this},clone:function(){return new this.constructor().fromArray(this.elements)},copy:function(e){var t=this.elements,i=e.elements;return t[0]=i[0],t[1]=i[1],t[2]=i[2],t[3]=i[3],t[4]=i[4],t[5]=i[5],t[6]=i[6],t[7]=i[7],t[8]=i[8],this},setFromMatrix4:function(e){var t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this},applyToBufferAttribute:function(){var e=new T;return function(i){for(var r=0,n=i.count;r<n;r++)e.x=i.getX(r),e.y=i.getY(r),e.z=i.getZ(r),e.applyMatrix3(this),i.setXYZ(r,e.x,e.y,e.z);return i}}(),multiply:function(e){return this.multiplyMatrices(this,e)},premultiply:function(e){return this.multiplyMatrices(e,this)},multiplyMatrices:function(e,t){var i=e.elements,r=t.elements,n=this.elements,a=i[0],s=i[3],o=i[6],u=i[1],l=i[4],f=i[7],c=i[2],h=i[5],p=i[8],v=r[0],_=r[3],M=r[6],w=r[1],S=r[4],L=r[7],b=r[2],R=r[5],P=r[8];return n[0]=a*v+s*w+o*b,n[3]=a*_+s*S+o*R,n[6]=a*M+s*L+o*P,n[1]=u*v+l*w+f*b,n[4]=u*_+l*S+f*R,n[7]=u*M+l*L+f*P,n[2]=c*v+h*w+p*b,n[5]=c*_+h*S+p*R,n[8]=c*M+h*L+p*P,this},multiplyScalar:function(e){var t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this},determinant:function(){var e=this.elements,t=e[0],i=e[1],r=e[2],n=e[3],a=e[4],s=e[5],o=e[6],u=e[7],l=e[8];return t*a*l-t*s*u-i*n*l+i*s*o+r*n*u-r*a*o},getInverse:function(e,t){e&&e.isMatrix4&&console.error("THREE.Matrix3: .getInverse() no longer takes a Matrix4 argument.");var i=e.elements,r=this.elements,n=i[0],a=i[1],s=i[2],o=i[3],u=i[4],l=i[5],f=i[6],c=i[7],h=i[8],p=h*u-l*c,v=l*f-h*o,_=c*o-u*f,M=n*p+a*v+s*_;if(M===0){var w="THREE.Matrix3: .getInverse() can't invert matrix, determinant is 0";if(t===!0)throw new Error(w);return console.warn(w),this.identity()}var S=1/M;return r[0]=p*S,r[1]=(s*c-h*a)*S,r[2]=(l*a-s*u)*S,r[3]=v*S,r[4]=(h*n-s*f)*S,r[5]=(s*o-l*n)*S,r[6]=_*S,r[7]=(a*f-c*n)*S,r[8]=(u*n-a*o)*S,this},transpose:function(){var e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this},getNormalMatrix:function(e){return this.setFromMatrix4(e).getInverse(this).transpose()},transposeIntoArray:function(e){var t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this},setUvTransform:function(e,t,i,r,n,a,s){var o=Math.cos(n),u=Math.sin(n);this.set(i*o,i*u,-i*(o*a+u*s)+a+e,-r*u,r*o,-r*(-u*a+o*s)+s+t,0,0,1)},scale:function(e,t){var i=this.elements;return i[0]*=e,i[3]*=e,i[6]*=e,i[1]*=t,i[4]*=t,i[7]*=t,this},rotate:function(e){var t=Math.cos(e),i=Math.sin(e),r=this.elements,n=r[0],a=r[3],s=r[6],o=r[1],u=r[4],l=r[7];return r[0]=t*n+i*o,r[3]=t*a+i*u,r[6]=t*s+i*l,r[1]=-i*n+t*o,r[4]=-i*a+t*u,r[7]=-i*s+t*l,this},translate:function(e,t){var i=this.elements;return i[0]+=e*i[2],i[3]+=e*i[5],i[6]+=e*i[8],i[1]+=t*i[2],i[4]+=t*i[5],i[7]+=t*i[8],this},equals:function(e){for(var t=this.elements,i=e.elements,r=0;r<9;r++)if(t[r]!==i[r])return!1;return!0},fromArray:function(e,t){t===void 0&&(t=0);for(var i=0;i<9;i++)this.elements[i]=e[i+t];return this},toArray:function(e,t){e===void 0&&(e=[]),t===void 0&&(t=0);var i=this.elements;return e[t]=i[0],e[t+1]=i[1],e[t+2]=i[2],e[t+3]=i[3],e[t+4]=i[4],e[t+5]=i[5],e[t+6]=i[6],e[t+7]=i[7],e[t+8]=i[8],e}});var gt,Wi={getDataURL:function(e){var t;if(typeof HTMLCanvasElement>"u")return e.src;if(e instanceof HTMLCanvasElement)t=e;else{gt===void 0&&(gt=document.createElementNS("http://www.w3.org/1999/xhtml","canvas")),gt.width=e.width,gt.height=e.height;var i=gt.getContext("2d");e instanceof ImageData?i.putImageData(e,0,0):i.drawImage(e,0,0,e.width,e.height),t=gt}return t.width>2048||t.height>2048?t.toDataURL("image/jpeg",.6):t.toDataURL("image/png")}},ha=0;function Ue(e,t,i,r,n,a,s,o,u,l){Object.defineProperty(this,"id",{value:ha++}),this.uuid=xe.generateUUID(),this.name="",this.image=e!==void 0?e:Ue.DEFAULT_IMAGE,this.mipmaps=[],this.mapping=t!==void 0?t:Ue.DEFAULT_MAPPING,this.wrapS=i!==void 0?i:rt,this.wrapT=r!==void 0?r:rt,this.magFilter=n!==void 0?n:pt,this.minFilter=a!==void 0?a:gr,this.anisotropy=u!==void 0?u:1,this.format=s!==void 0?s:ft,this.type=o!==void 0?o:$t,this.offset=new de(0,0),this.repeat=new de(1,1),this.center=new de(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new je,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.encoding=l!==void 0?l:qt,this.version=0,this.onUpdate=null}Ue.DEFAULT_IMAGE=void 0;Ue.DEFAULT_MAPPING=cr;Ue.prototype=Object.assign(Object.create(vt.prototype),{constructor:Ue,isTexture:!0,updateMatrix:function(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)},clone:function(){return new this.constructor().copy(this)},copy:function(e){return this.name=e.name,this.image=e.image,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.type=e.type,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.encoding=e.encoding,this},toJSON:function(e){var t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];var i={metadata:{version:4.5,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,mapping:this.mapping,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,type:this.type,encoding:this.encoding,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};if(this.image!==void 0){var r=this.image;if(r.uuid===void 0&&(r.uuid=xe.generateUUID()),!t&&e.images[r.uuid]===void 0){var n;if(Array.isArray(r)){n=[];for(var a=0,s=r.length;a<s;a++)n.push(Wi.getDataURL(r[a]))}else n=Wi.getDataURL(r);e.images[r.uuid]={uuid:r.uuid,url:n}}i.image=r.uuid}return t||(e.textures[this.uuid]=i),i},dispose:function(){this.dispatchEvent({type:"dispose"})},transformUv:function(e){if(this.mapping!==cr)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case li:e.x=e.x-Math.floor(e.x);break;case rt:e.x=e.x<0?0:1;break;case ui:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case li:e.y=e.y-Math.floor(e.y);break;case rt:e.y=e.y<0?0:1;break;case ui:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}});Object.defineProperty(Ue.prototype,"needsUpdate",{set:function(e){e===!0&&this.version++}});function xt(){var e=new Uint8Array(3),t=1,i=1,r=Xt;Ue.call(this,null,void 0,void 0,void 0,void 0,void 0,r,void 0,void 0,void 0),this.image={data:e,width:t,height:i},this.magFilter=Ge,this.minFilter=Ge,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}xt.prototype=Object.create(Ue.prototype);xt.prototype.constructor=xt;xt.prototype.isDataTexture=!0;xt.prototype.isCfxTexture=!0;function yt(e,t){this.min=e!==void 0?e:new T(1/0,1/0,1/0),this.max=t!==void 0?t:new T(-1/0,-1/0,-1/0)}Object.assign(yt.prototype,{isBox3:!0,set:function(e,t){return this.min.copy(e),this.max.copy(t),this},setFromArray:function(e){for(var t=1/0,i=1/0,r=1/0,n=-1/0,a=-1/0,s=-1/0,o=0,u=e.length;o<u;o+=3){var l=e[o],f=e[o+1],c=e[o+2];l<t&&(t=l),f<i&&(i=f),c<r&&(r=c),l>n&&(n=l),f>a&&(a=f),c>s&&(s=c)}return this.min.set(t,i,r),this.max.set(n,a,s),this},setFromBufferAttribute:function(e){for(var t=1/0,i=1/0,r=1/0,n=-1/0,a=-1/0,s=-1/0,o=0,u=e.count;o<u;o++){var l=e.getX(o),f=e.getY(o),c=e.getZ(o);l<t&&(t=l),f<i&&(i=f),c<r&&(r=c),l>n&&(n=l),f>a&&(a=f),c>s&&(s=c)}return this.min.set(t,i,r),this.max.set(n,a,s),this},setFromPoints:function(e){this.makeEmpty();for(var t=0,i=e.length;t<i;t++)this.expandByPoint(e[t]);return this},setFromCenterAndSize:function(){var e=new T;return function(i,r){var n=e.copy(r).multiplyScalar(.5);return this.min.copy(i).sub(n),this.max.copy(i).add(n),this}}(),setFromObject:function(e){return this.makeEmpty(),this.expandByObject(e)},clone:function(){return new this.constructor().copy(this)},copy:function(e){return this.min.copy(e.min),this.max.copy(e.max),this},makeEmpty:function(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this},isEmpty:function(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z},getCenter:function(e){return e===void 0&&(console.warn("THREE.Box3: .getCenter() target is now required"),e=new T),this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)},getSize:function(e){return e===void 0&&(console.warn("THREE.Box3: .getSize() target is now required"),e=new T),this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)},expandByPoint:function(e){return this.min.min(e),this.max.max(e),this},expandByVector:function(e){return this.min.sub(e),this.max.add(e),this},expandByScalar:function(e){return this.min.addScalar(-e),this.max.addScalar(e),this},expandByObject:function(){var e,t,i,r=new T;function n(a){var s=a.geometry;if(s!==void 0){if(s.isGeometry){var o=s.vertices;for(t=0,i=o.length;t<i;t++)r.copy(o[t]),r.applyMatrix4(a.matrixWorld),e.expandByPoint(r)}else if(s.isBufferGeometry){var u=s.attributes.position;if(u!==void 0)for(t=0,i=u.count;t<i;t++)r.fromBufferAttribute(u,t).applyMatrix4(a.matrixWorld),e.expandByPoint(r)}}}return function(s){return e=this,s.updateMatrixWorld(!0),s.traverse(n),this}}(),containsPoint:function(e){return!(e.x<this.min.x||e.x>this.max.x||e.y<this.min.y||e.y>this.max.y||e.z<this.min.z||e.z>this.max.z)},containsBox:function(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z},getParameter:function(e,t){return t===void 0&&(console.warn("THREE.Box3: .getParameter() target is now required"),t=new T),t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))},intersectsBox:function(e){return!(e.max.x<this.min.x||e.min.x>this.max.x||e.max.y<this.min.y||e.min.y>this.max.y||e.max.z<this.min.z||e.min.z>this.max.z)},intersectsSphere:function(){var e=new T;return function(i){return this.clampPoint(i.center,e),e.distanceToSquared(i.center)<=i.radius*i.radius}}(),intersectsPlane:function(e){var t,i;return e.normal.x>0?(t=e.normal.x*this.min.x,i=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,i=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,i+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,i+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,i+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,i+=e.normal.z*this.min.z),t<=-e.constant&&i>=-e.constant},intersectsTriangle:function(){var e=new T,t=new T,i=new T,r=new T,n=new T,a=new T,s=new T,o=new T,u=new T,l=new T;function f(c){var h,p;for(h=0,p=c.length-3;h<=p;h+=3){s.fromArray(c,h);var v=u.x*Math.abs(s.x)+u.y*Math.abs(s.y)+u.z*Math.abs(s.z),_=e.dot(s),M=t.dot(s),w=i.dot(s);if(Math.max(-Math.max(_,M,w),Math.min(_,M,w))>v)return!1}return!0}return function(h){if(this.isEmpty())return!1;this.getCenter(o),u.subVectors(this.max,o),e.subVectors(h.a,o),t.subVectors(h.b,o),i.subVectors(h.c,o),r.subVectors(t,e),n.subVectors(i,t),a.subVectors(e,i);var p=[0,-r.z,r.y,0,-n.z,n.y,0,-a.z,a.y,r.z,0,-r.x,n.z,0,-n.x,a.z,0,-a.x,-r.y,r.x,0,-n.y,n.x,0,-a.y,a.x,0];return!f(p)||(p=[1,0,0,0,1,0,0,0,1],!f(p))?!1:(l.crossVectors(r,n),p=[l.x,l.y,l.z],f(p))}}(),clampPoint:function(e,t){return t===void 0&&(console.warn("THREE.Box3: .clampPoint() target is now required"),t=new T),t.copy(e).clamp(this.min,this.max)},distanceToPoint:function(){var e=new T;return function(i){var r=e.copy(i).clamp(this.min,this.max);return r.sub(i).length()}}(),getBoundingSphere:function(){var e=new T;return function(i){return i===void 0&&(console.warn("THREE.Box3: .getBoundingSphere() target is now required"),i=new mt),this.getCenter(i.center),i.radius=this.getSize(e).length()*.5,i}}(),intersect:function(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this},union:function(e){return this.min.min(e.min),this.max.max(e.max),this},applyMatrix4:function(){var e=[new T,new T,new T,new T,new T,new T,new T,new T];return function(i){return this.isEmpty()?this:(e[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(i),e[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(i),e[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(i),e[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(i),e[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(i),e[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(i),e[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(i),e[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(i),this.setFromPoints(e),this)}}(),translate:function(e){return this.min.add(e),this.max.add(e),this},equals:function(e){return e.min.equals(this.min)&&e.max.equals(this.max)}});function mt(e,t){this.center=e!==void 0?e:new T,this.radius=t!==void 0?t:0}Object.assign(mt.prototype,{set:function(e,t){return this.center.copy(e),this.radius=t,this},setFromPoints:function(){var e=new yt;return function(i,r){var n=this.center;r!==void 0?n.copy(r):e.setFromPoints(i).getCenter(n);for(var a=0,s=0,o=i.length;s<o;s++)a=Math.max(a,n.distanceToSquared(i[s]));return this.radius=Math.sqrt(a),this}}(),clone:function(){return new this.constructor().copy(this)},copy:function(e){return this.center.copy(e.center),this.radius=e.radius,this},empty:function(){return this.radius<=0},containsPoint:function(e){return e.distanceToSquared(this.center)<=this.radius*this.radius},distanceToPoint:function(e){return e.distanceTo(this.center)-this.radius},intersectsSphere:function(e){var t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t},intersectsBox:function(e){return e.intersectsSphere(this)},intersectsPlane:function(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius},clampPoint:function(e,t){var i=this.center.distanceToSquared(e);return t===void 0&&(console.warn("THREE.Sphere: .clampPoint() target is now required"),t=new T),t.copy(e),i>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t},getBoundingBox:function(e){return e===void 0&&(console.warn("THREE.Sphere: .getBoundingBox() target is now required"),e=new yt),e.set(this.center,this.center),e.expandByScalar(this.radius),e},applyMatrix4:function(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this},translate:function(e){return this.center.add(e),this},equals:function(e){return e.center.equals(this.center)&&e.radius===this.radius}});function Mr(e,t){this.origin=e!==void 0?e:new T,this.direction=t!==void 0?t:new T}Object.assign(Mr.prototype,{set:function(e,t){return this.origin.copy(e),this.direction.copy(t),this},clone:function(){return new this.constructor().copy(this)},copy:function(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this},at:function(e,t){return t===void 0&&(console.warn("THREE.Ray: .at() target is now required"),t=new T),t.copy(this.direction).multiplyScalar(e).add(this.origin)},lookAt:function(e){return this.direction.copy(e).sub(this.origin).normalize(),this},recast:function(){var e=new T;return function(i){return this.origin.copy(this.at(i,e)),this}}(),closestPointToPoint:function(e,t){t===void 0&&(console.warn("THREE.Ray: .closestPointToPoint() target is now required"),t=new T),t.subVectors(e,this.origin);var i=t.dot(this.direction);return i<0?t.copy(this.origin):t.copy(this.direction).multiplyScalar(i).add(this.origin)},distanceToPoint:function(e){return Math.sqrt(this.distanceSqToPoint(e))},distanceSqToPoint:function(){var e=new T;return function(i){var r=e.subVectors(i,this.origin).dot(this.direction);return r<0?this.origin.distanceToSquared(i):(e.copy(this.direction).multiplyScalar(r).add(this.origin),e.distanceToSquared(i))}}(),distanceSqToSegment:function(){var e=new T,t=new T,i=new T;return function(n,a,s,o){e.copy(n).add(a).multiplyScalar(.5),t.copy(a).sub(n).normalize(),i.copy(this.origin).sub(e);var u=n.distanceTo(a)*.5,l=-this.direction.dot(t),f=i.dot(this.direction),c=-i.dot(t),h=i.lengthSq(),p=Math.abs(1-l*l),v,_,M,w;if(p>0)if(v=l*c-f,_=l*f-c,w=u*p,v>=0)if(_>=-w)if(_<=w){var S=1/p;v*=S,_*=S,M=v*(v+l*_+2*f)+_*(l*v+_+2*c)+h}else _=u,v=Math.max(0,-(l*_+f)),M=-v*v+_*(_+2*c)+h;else _=-u,v=Math.max(0,-(l*_+f)),M=-v*v+_*(_+2*c)+h;else _<=-w?(v=Math.max(0,-(-l*u+f)),_=v>0?-u:Math.min(Math.max(-u,-c),u),M=-v*v+_*(_+2*c)+h):_<=w?(v=0,_=Math.min(Math.max(-u,-c),u),M=_*(_+2*c)+h):(v=Math.max(0,-(l*u+f)),_=v>0?u:Math.min(Math.max(-u,-c),u),M=-v*v+_*(_+2*c)+h);else _=l>0?-u:u,v=Math.max(0,-(l*_+f)),M=-v*v+_*(_+2*c)+h;return s&&s.copy(this.direction).multiplyScalar(v).add(this.origin),o&&o.copy(t).multiplyScalar(_).add(e),M}}(),intersectSphere:function(){var e=new T;return function(i,r){e.subVectors(i.center,this.origin);var n=e.dot(this.direction),a=e.dot(e)-n*n,s=i.radius*i.radius;if(a>s)return null;var o=Math.sqrt(s-a),u=n-o,l=n+o;return u<0&&l<0?null:u<0?this.at(l,r):this.at(u,r)}}(),intersectsSphere:function(e){return this.distanceSqToPoint(e.center)<=e.radius*e.radius},distanceToPlane:function(e){var t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;var i=-(this.origin.dot(e.normal)+e.constant)/t;return i>=0?i:null},intersectPlane:function(e,t){var i=this.distanceToPlane(e);return i===null?null:this.at(i,t)},intersectsPlane:function(e){var t=e.distanceToPoint(this.origin);if(t===0)return!0;var i=e.normal.dot(this.direction);return i*t<0},intersectBox:function(e,t){var i,r,n,a,s,o,u=1/this.direction.x,l=1/this.direction.y,f=1/this.direction.z,c=this.origin;return u>=0?(i=(e.min.x-c.x)*u,r=(e.max.x-c.x)*u):(i=(e.max.x-c.x)*u,r=(e.min.x-c.x)*u),l>=0?(n=(e.min.y-c.y)*l,a=(e.max.y-c.y)*l):(n=(e.max.y-c.y)*l,a=(e.min.y-c.y)*l),i>a||n>r||((n>i||i!==i)&&(i=n),(a<r||r!==r)&&(r=a),f>=0?(s=(e.min.z-c.z)*f,o=(e.max.z-c.z)*f):(s=(e.max.z-c.z)*f,o=(e.min.z-c.z)*f),i>o||s>r)||((s>i||i!==i)&&(i=s),(o<r||r!==r)&&(r=o),r<0)?null:this.at(i>=0?i:r,t)},intersectsBox:function(){var e=new T;return function(i){return this.intersectBox(i,e)!==null}}(),intersectTriangle:function(){var e=new T,t=new T,i=new T,r=new T;return function(a,s,o,u,l){t.subVectors(s,a),i.subVectors(o,a),r.crossVectors(t,i);var f=this.direction.dot(r),c;if(f>0){if(u)return null;c=1}else if(f<0)c=-1,f=-f;else return null;e.subVectors(this.origin,a);var h=c*this.direction.dot(i.crossVectors(e,i));if(h<0)return null;var p=c*this.direction.dot(t.cross(e));if(p<0||h+p>f)return null;var v=-c*e.dot(r);return v<0?null:this.at(v/f,l)}}(),applyMatrix4:function(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this},equals:function(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}});function Tt(e,t,i,r){this._x=e||0,this._y=t||0,this._z=i||0,this._order=r||Tt.DefaultOrder}Tt.RotationOrders=["XYZ","YZX","ZXY","XZY","YXZ","ZYX"];Tt.DefaultOrder="XYZ";Object.defineProperties(Tt.prototype,{x:{get:function(){return this._x},set:function(e){this._x=e,this.onChangeCallback()}},y:{get:function(){return this._y},set:function(e){this._y=e,this.onChangeCallback()}},z:{get:function(){return this._z},set:function(e){this._z=e,this.onChangeCallback()}},order:{get:function(){return this._order},set:function(e){this._order=e,this.onChangeCallback()}}});Object.assign(Tt.prototype,{isEuler:!0,set:function(e,t,i,r){return this._x=e,this._y=t,this._z=i,this._order=r||this._order,this.onChangeCallback(),this},clone:function(){return new this.constructor(this._x,this._y,this._z,this._order)},copy:function(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this.onChangeCallback(),this},setFromRotationMatrix:function(e,t,i){var r=xe.clamp,n=e.elements,a=n[0],s=n[4],o=n[8],u=n[1],l=n[5],f=n[9],c=n[2],h=n[6],p=n[10];return t=t||this._order,t==="XYZ"?(this._y=Math.asin(r(o,-1,1)),Math.abs(o)<.99999?(this._x=Math.atan2(-f,p),this._z=Math.atan2(-s,a)):(this._x=Math.atan2(h,l),this._z=0)):t==="YXZ"?(this._x=Math.asin(-r(f,-1,1)),Math.abs(f)<.99999?(this._y=Math.atan2(o,p),this._z=Math.atan2(u,l)):(this._y=Math.atan2(-c,a),this._z=0)):t==="ZXY"?(this._x=Math.asin(r(h,-1,1)),Math.abs(h)<.99999?(this._y=Math.atan2(-c,p),this._z=Math.atan2(-s,l)):(this._y=0,this._z=Math.atan2(u,a))):t==="ZYX"?(this._y=Math.asin(-r(c,-1,1)),Math.abs(c)<.99999?(this._x=Math.atan2(h,p),this._z=Math.atan2(u,a)):(this._x=0,this._z=Math.atan2(-s,l))):t==="YZX"?(this._z=Math.asin(r(u,-1,1)),Math.abs(u)<.99999?(this._x=Math.atan2(-f,l),this._y=Math.atan2(-c,a)):(this._x=0,this._y=Math.atan2(o,p))):t==="XZY"?(this._z=Math.asin(-r(s,-1,1)),Math.abs(s)<.99999?(this._x=Math.atan2(h,l),this._y=Math.atan2(o,a)):(this._x=Math.atan2(-f,p),this._y=0)):console.warn("THREE.Euler: .setFromRotationMatrix() given unsupported order: "+t),this._order=t,i!==!1&&this.onChangeCallback(),this},setFromQuaternion:function(){var e=new pe;return function(i,r,n){return e.makeRotationFromQuaternion(i),this.setFromRotationMatrix(e,r,n)}}(),setFromVector3:function(e,t){return this.set(e.x,e.y,e.z,t||this._order)},reorder:function(){var e=new Xe;return function(i){return e.setFromEuler(this),this.setFromQuaternion(e,i)}}(),equals:function(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order},fromArray:function(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this.onChangeCallback(),this},toArray:function(e,t){return e===void 0&&(e=[]),t===void 0&&(t=0),e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e},toVector3:function(e){return e?e.set(this._x,this._y,this._z):new T(this._x,this._y,this._z)},onChange:function(e){return this.onChangeCallback=e,this},onChangeCallback:function(){}});function Er(){this.mask=1}Object.assign(Er.prototype,{set:function(e){this.mask=1<<e|0},enable:function(e){this.mask|=1<<e|0},toggle:function(e){this.mask^=1<<e|0},disable:function(e){this.mask&=~(1<<e|0)},test:function(e){return(this.mask&e.mask)!==0}});var da=0;function we(){Object.defineProperty(this,"id",{value:da++}),this.uuid=xe.generateUUID(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=we.DefaultUp.clone();var e=new T,t=new Tt,i=new Xe,r=new T(1,1,1);function n(){i.setFromEuler(t,!1)}function a(){t.setFromQuaternion(i,void 0,!1)}t.onChange(n),i.onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:i},scale:{configurable:!0,enumerable:!0,value:r},modelViewMatrix:{value:new pe},normalMatrix:{value:new je}}),this.matrix=new pe,this.matrixWorld=new pe,this.matrixAutoUpdate=we.DefaultMatrixAutoUpdate,this.matrixWorldNeedsUpdate=!1,this.layers=new Er,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.userData={}}we.DefaultUp=new T(0,1,0);we.DefaultMatrixAutoUpdate=!0;we.prototype=Object.assign(Object.create(vt.prototype),{constructor:we,isObject3D:!0,onBeforeRender:function(){},onAfterRender:function(){},applyMatrix:function(e){this.matrix.multiplyMatrices(e,this.matrix),this.matrix.decompose(this.position,this.quaternion,this.scale)},applyQuaternion:function(e){return this.quaternion.premultiply(e),this},setRotationFromAxisAngle:function(e,t){this.quaternion.setFromAxisAngle(e,t)},setRotationFromEuler:function(e){this.quaternion.setFromEuler(e,!0)},setRotationFromMatrix:function(e){this.quaternion.setFromRotationMatrix(e)},setRotationFromQuaternion:function(e){this.quaternion.copy(e)},rotateOnAxis:function(){var e=new Xe;return function(i,r){return e.setFromAxisAngle(i,r),this.quaternion.multiply(e),this}}(),rotateOnWorldAxis:function(){var e=new Xe;return function(i,r){return e.setFromAxisAngle(i,r),this.quaternion.premultiply(e),this}}(),rotateX:function(){var e=new T(1,0,0);return function(i){return this.rotateOnAxis(e,i)}}(),rotateY:function(){var e=new T(0,1,0);return function(i){return this.rotateOnAxis(e,i)}}(),rotateZ:function(){var e=new T(0,0,1);return function(i){return this.rotateOnAxis(e,i)}}(),translateOnAxis:function(){var e=new T;return function(i,r){return e.copy(i).applyQuaternion(this.quaternion),this.position.add(e.multiplyScalar(r)),this}}(),translateX:function(){var e=new T(1,0,0);return function(i){return this.translateOnAxis(e,i)}}(),translateY:function(){var e=new T(0,1,0);return function(i){return this.translateOnAxis(e,i)}}(),translateZ:function(){var e=new T(0,0,1);return function(i){return this.translateOnAxis(e,i)}}(),localToWorld:function(e){return e.applyMatrix4(this.matrixWorld)},worldToLocal:function(){var e=new pe;return function(i){return i.applyMatrix4(e.getInverse(this.matrixWorld))}}(),lookAt:function(){var e=new Xe,t=new pe,i=new T,r=new T;return function(a,s,o){a.isVector3?i.copy(a):i.set(a,s,o);var u=this.parent;this.updateWorldMatrix(!0,!1),r.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?t.lookAt(r,i,this.up):t.lookAt(i,r,this.up),this.quaternion.setFromRotationMatrix(t),u&&(t.extractRotation(u.matrixWorld),e.setFromRotationMatrix(t),this.quaternion.premultiply(e.inverse()))}}(),add:function(e){if(arguments.length>1){for(var t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(console.error("THREE.Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.parent!==null&&e.parent.remove(e),e.parent=this,e.dispatchEvent({type:"added"}),this.children.push(e)):console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.",e),this)},remove:function(e){if(arguments.length>1){for(var t=0;t<arguments.length;t++)this.remove(arguments[t]);return this}var i=this.children.indexOf(e);return i!==-1&&(e.parent=null,e.dispatchEvent({type:"removed"}),this.children.splice(i,1)),this},getObjectById:function(e){return this.getObjectByProperty("id",e)},getObjectByName:function(e){return this.getObjectByProperty("name",e)},getObjectByProperty:function(e,t){if(this[e]===t)return this;for(var i=0,r=this.children.length;i<r;i++){var n=this.children[i],a=n.getObjectByProperty(e,t);if(a!==void 0)return a}},getWorldPosition:function(e){return e===void 0&&(console.warn("THREE.Object3D: .getWorldPosition() target is now required"),e=new T),this.updateMatrixWorld(!0),e.setFromMatrixPosition(this.matrixWorld)},getWorldQuaternion:function(){var e=new T,t=new T;return function(r){return r===void 0&&(console.warn("THREE.Object3D: .getWorldQuaternion() target is now required"),r=new Xe),this.updateMatrixWorld(!0),this.matrixWorld.decompose(e,r,t),r}}(),getWorldScale:function(){var e=new T,t=new Xe;return function(r){return r===void 0&&(console.warn("THREE.Object3D: .getWorldScale() target is now required"),r=new T),this.updateMatrixWorld(!0),this.matrixWorld.decompose(e,t,r),r}}(),getWorldDirection:function(e){e===void 0&&(console.warn("THREE.Object3D: .getWorldDirection() target is now required"),e=new T),this.updateMatrixWorld(!0);var t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()},raycast:function(){},traverse:function(e){e(this);for(var t=this.children,i=0,r=t.length;i<r;i++)t[i].traverse(e)},traverseVisible:function(e){if(this.visible!==!1){e(this);for(var t=this.children,i=0,r=t.length;i<r;i++)t[i].traverseVisible(e)}},traverseAncestors:function(e){var t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))},updateMatrix:function(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0},updateMatrixWorld:function(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix),this.matrixWorldNeedsUpdate=!1,e=!0);for(var t=this.children,i=0,r=t.length;i<r;i++)t[i].updateMatrixWorld(e)},updateWorldMatrix:function(e,t){var i=this.parent;if(e===!0&&i!==null&&i.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix),t===!0)for(var r=this.children,n=0,a=r.length;n<a;n++)r[n].updateWorldMatrix(!1,!0)},toJSON:function(e){var t=e===void 0||typeof e=="string",i={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{}},i.metadata={version:4.5,type:"Object",generator:"Object3D.toJSON"});var r={};r.uuid=this.uuid,r.type=this.type,this.name!==""&&(r.name=this.name),this.castShadow===!0&&(r.castShadow=!0),this.receiveShadow===!0&&(r.receiveShadow=!0),this.visible===!1&&(r.visible=!1),this.frustumCulled===!1&&(r.frustumCulled=!1),this.renderOrder!==0&&(r.renderOrder=this.renderOrder),JSON.stringify(this.userData)!=="{}"&&(r.userData=this.userData),r.layers=this.layers.mask,r.matrix=this.matrix.toArray(),this.matrixAutoUpdate===!1&&(r.matrixAutoUpdate=!1);function n(M,w){return M[w.uuid]===void 0&&(M[w.uuid]=w.toJSON(e)),w.uuid}if(this.isMesh||this.isLine||this.isPoints){r.geometry=n(e.geometries,this.geometry);var a=this.geometry.parameters;if(a!==void 0&&a.shapes!==void 0){var s=a.shapes;if(Array.isArray(s))for(var o=0,u=s.length;o<u;o++){var l=s[o];n(e.shapes,l)}else n(e.shapes,s)}}if(this.material!==void 0)if(Array.isArray(this.material)){for(var f=[],o=0,u=this.material.length;o<u;o++)f.push(n(e.materials,this.material[o]));r.material=f}else r.material=n(e.materials,this.material);if(this.children.length>0){r.children=[];for(var o=0;o<this.children.length;o++)r.children.push(this.children[o].toJSON(e).object)}if(t){var c=_(e.geometries),h=_(e.materials),p=_(e.textures),v=_(e.images),s=_(e.shapes);c.length>0&&(i.geometries=c),h.length>0&&(i.materials=h),p.length>0&&(i.textures=p),v.length>0&&(i.images=v),s.length>0&&(i.shapes=s)}return i.object=r,i;function _(M){var w=[];for(var S in M){var L=M[S];delete L.metadata,w.push(L)}return w}},clone:function(e){return new this.constructor().copy(this,e)},copy:function(e,t){if(t===void 0&&(t=!0),this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(var i=0;i<e.children.length;i++){var r=e.children[i];this.add(r.clone())}return this}});function Qe(e,t,i){this.a=e!==void 0?e:new T,this.b=t!==void 0?t:new T,this.c=i!==void 0?i:new T}Object.assign(Qe,{getNormal:function(){var e=new T;return function(i,r,n,a){a===void 0&&(console.warn("THREE.Triangle: .getNormal() target is now required"),a=new T),a.subVectors(n,r),e.subVectors(i,r),a.cross(e);var s=a.lengthSq();return s>0?a.multiplyScalar(1/Math.sqrt(s)):a.set(0,0,0)}}(),getBarycoord:function(){var e=new T,t=new T,i=new T;return function(n,a,s,o,u){e.subVectors(o,a),t.subVectors(s,a),i.subVectors(n,a);var l=e.dot(e),f=e.dot(t),c=e.dot(i),h=t.dot(t),p=t.dot(i),v=l*h-f*f;if(u===void 0&&(console.warn("THREE.Triangle: .getBarycoord() target is now required"),u=new T),v===0)return u.set(-2,-1,-1);var _=1/v,M=(h*c-f*p)*_,w=(l*p-f*c)*_;return u.set(1-M-w,w,M)}}(),containsPoint:function(){var e=new T;return function(i,r,n,a){return Qe.getBarycoord(i,r,n,a,e),e.x>=0&&e.y>=0&&e.x+e.y<=1}}(),getUV:function(){var e=new T;return function(i,r,n,a,s,o,u,l){return this.getBarycoord(i,r,n,a,e),l.set(0,0),l.addScaledVector(s,e.x),l.addScaledVector(o,e.y),l.addScaledVector(u,e.z),l}}()});Object.assign(Qe.prototype,{set:function(e,t,i){return this.a.copy(e),this.b.copy(t),this.c.copy(i),this},setFromPointsAndIndices:function(e,t,i,r){return this.a.copy(e[t]),this.b.copy(e[i]),this.c.copy(e[r]),this},clone:function(){return new this.constructor().copy(this)},copy:function(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this},getArea:function(){var e=new T,t=new T;return function(){return e.subVectors(this.c,this.b),t.subVectors(this.a,this.b),e.cross(t).length()*.5}}(),getMidpoint:function(e){return e===void 0&&(console.warn("THREE.Triangle: .getMidpoint() target is now required"),e=new T),e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)},getNormal:function(e){return Qe.getNormal(this.a,this.b,this.c,e)},getPlane:function(e){return e===void 0&&(console.warn("THREE.Triangle: .getPlane() target is now required"),e=new T),e.setFromCoplanarPoints(this.a,this.b,this.c)},getBarycoord:function(e,t){return Qe.getBarycoord(e,this.a,this.b,this.c,t)},containsPoint:function(e){return Qe.containsPoint(e,this.a,this.b,this.c)},getUV:function(e,t,i,r,n){return Qe.getUV(e,this.a,this.b,this.c,t,i,r,n)},intersectsBox:function(e){return e.intersectsTriangle(this)},closestPointToPoint:function(){var e=new T,t=new T,i=new T,r=new T,n=new T,a=new T;return function(o,u){u===void 0&&(console.warn("THREE.Triangle: .closestPointToPoint() target is now required"),u=new T);var l=this.a,f=this.b,c=this.c,h,p;e.subVectors(f,l),t.subVectors(c,l),r.subVectors(o,l);var v=e.dot(r),_=t.dot(r);if(v<=0&&_<=0)return u.copy(l);n.subVectors(o,f);var M=e.dot(n),w=t.dot(n);if(M>=0&&w<=M)return u.copy(f);var S=v*w-M*_;if(S<=0&&v>=0&&M<=0)return h=v/(v-M),u.copy(l).addScaledVector(e,h);a.subVectors(o,c);var L=e.dot(a),b=t.dot(a);if(b>=0&&L<=b)return u.copy(c);var R=L*_-v*b;if(R<=0&&_>=0&&b<=0)return p=_/(_-b),u.copy(l).addScaledVector(t,p);var P=M*b-L*w;if(P<=0&&w-M>=0&&L-b>=0)return i.subVectors(c,f),p=(w-M)/(w-M+(L-b)),u.copy(f).addScaledVector(i,p);var U=1/(P+R+S);return h=R*U,p=S*U,u.copy(l).addScaledVector(e,h).addScaledVector(t,p)}}(),equals:function(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}});var pa={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074};function Ae(e,t,i){return t===void 0&&i===void 0?this.set(e):this.setRGB(e,t,i)}Object.assign(Ae.prototype,{isColor:!0,r:1,g:1,b:1,set:function(e){return e&&e.isColor?this.copy(e):typeof e=="number"?this.setHex(e):typeof e=="string"&&this.setStyle(e),this},setScalar:function(e){return this.r=e,this.g=e,this.b=e,this},setHex:function(e){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,this},setRGB:function(e,t,i){return this.r=e,this.g=t,this.b=i,this},setHSL:function(){function e(t,i,r){return r<0&&(r+=1),r>1&&(r-=1),r<1/6?t+(i-t)*6*r:r<1/2?i:r<2/3?t+(i-t)*6*(2/3-r):t}return function(i,r,n){if(i=xe.euclideanModulo(i,1),r=xe.clamp(r,0,1),n=xe.clamp(n,0,1),r===0)this.r=this.g=this.b=n;else{var a=n<=.5?n*(1+r):n+r-n*r,s=2*n-a;this.r=e(s,a,i+1/3),this.g=e(s,a,i),this.b=e(s,a,i-1/3)}return this}}(),setStyle:function(e){function t(c){c!==void 0&&parseFloat(c)<1&&console.warn("THREE.Color: Alpha component of "+e+" will be ignored.")}var i;if(i=/^((?:rgb|hsl)a?)\(\s*([^\)]*)\)/.exec(e)){var r,n=i[1],a=i[2];switch(n){case"rgb":case"rgba":if(r=/^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(,\s*([0-9]*\.?[0-9]+)\s*)?$/.exec(a))return this.r=Math.min(255,parseInt(r[1],10))/255,this.g=Math.min(255,parseInt(r[2],10))/255,this.b=Math.min(255,parseInt(r[3],10))/255,t(r[5]),this;if(r=/^(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(,\s*([0-9]*\.?[0-9]+)\s*)?$/.exec(a))return this.r=Math.min(100,parseInt(r[1],10))/100,this.g=Math.min(100,parseInt(r[2],10))/100,this.b=Math.min(100,parseInt(r[3],10))/100,t(r[5]),this;break;case"hsl":case"hsla":if(r=/^([0-9]*\.?[0-9]+)\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(,\s*([0-9]*\.?[0-9]+)\s*)?$/.exec(a)){var s=parseFloat(r[1])/360,o=parseInt(r[2],10)/100,u=parseInt(r[3],10)/100;return t(r[5]),this.setHSL(s,o,u)}break}}else if(i=/^\#([A-Fa-f0-9]+)$/.exec(e)){var l=i[1],f=l.length;if(f===3)return this.r=parseInt(l.charAt(0)+l.charAt(0),16)/255,this.g=parseInt(l.charAt(1)+l.charAt(1),16)/255,this.b=parseInt(l.charAt(2)+l.charAt(2),16)/255,this;if(f===6)return this.r=parseInt(l.charAt(0)+l.charAt(1),16)/255,this.g=parseInt(l.charAt(2)+l.charAt(3),16)/255,this.b=parseInt(l.charAt(4)+l.charAt(5),16)/255,this}if(e&&e.length>0){var l=pa[e];l!==void 0?this.setHex(l):console.warn("THREE.Color: Unknown color "+e)}return this},clone:function(){return new this.constructor(this.r,this.g,this.b)},copy:function(e){return this.r=e.r,this.g=e.g,this.b=e.b,this},copyGammaToLinear:function(e,t){return t===void 0&&(t=2),this.r=Math.pow(e.r,t),this.g=Math.pow(e.g,t),this.b=Math.pow(e.b,t),this},copyLinearToGamma:function(e,t){t===void 0&&(t=2);var i=t>0?1/t:1;return this.r=Math.pow(e.r,i),this.g=Math.pow(e.g,i),this.b=Math.pow(e.b,i),this},convertGammaToLinear:function(e){return this.copyGammaToLinear(this,e),this},convertLinearToGamma:function(e){return this.copyLinearToGamma(this,e),this},copySRGBToLinear:function(){function e(t){return t<.04045?t*.0773993808:Math.pow(t*.9478672986+.0521327014,2.4)}return function(i){return this.r=e(i.r),this.g=e(i.g),this.b=e(i.b),this}}(),copyLinearToSRGB:function(){function e(t){return t<.0031308?t*12.92:1.055*Math.pow(t,.41666)-.055}return function(i){return this.r=e(i.r),this.g=e(i.g),this.b=e(i.b),this}}(),convertSRGBToLinear:function(){return this.copySRGBToLinear(this),this},convertLinearToSRGB:function(){return this.copyLinearToSRGB(this),this},getHex:function(){return this.r*255<<16^this.g*255<<8^this.b*255<<0},getHexString:function(){return("000000"+this.getHex().toString(16)).slice(-6)},getHSL:function(e){e===void 0&&(console.warn("THREE.Color: .getHSL() target is now required"),e={h:0,s:0,l:0});var t=this.r,i=this.g,r=this.b,n=Math.max(t,i,r),a=Math.min(t,i,r),s,o,u=(a+n)/2;if(a===n)s=0,o=0;else{var l=n-a;switch(o=u<=.5?l/(n+a):l/(2-n-a),n){case t:s=(i-r)/l+(i<r?6:0);break;case i:s=(r-t)/l+2;break;case r:s=(t-i)/l+4;break}s/=6}return e.h=s,e.s=o,e.l=u,e},getStyle:function(){return"rgb("+(this.r*255|0)+","+(this.g*255|0)+","+(this.b*255|0)+")"},offsetHSL:function(){var e={};return function(t,i,r){return this.getHSL(e),e.h+=t,e.s+=i,e.l+=r,this.setHSL(e.h,e.s,e.l),this}}(),add:function(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this},addColors:function(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this},addScalar:function(e){return this.r+=e,this.g+=e,this.b+=e,this},sub:function(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this},multiply:function(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this},multiplyScalar:function(e){return this.r*=e,this.g*=e,this.b*=e,this},lerp:function(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this},lerpHSL:function(){var e={h:0,s:0,l:0},t={h:0,s:0,l:0};return function(r,n){this.getHSL(e),r.getHSL(t);var a=xe.lerp(e.h,t.h,n),s=xe.lerp(e.s,t.s,n),o=xe.lerp(e.l,t.l,n);return this.setHSL(a,s,o),this}}(),equals:function(e){return e.r===this.r&&e.g===this.g&&e.b===this.b},fromArray:function(e,t){return t===void 0&&(t=0),this.r=e[t],this.g=e[t+1],this.b=e[t+2],this},toArray:function(e,t){return e===void 0&&(e=[]),t===void 0&&(t=0),e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e},toJSON:function(){return this.getHex()}});function Yt(e,t,i,r,n,a){this.a=e,this.b=t,this.c=i,this.normal=r&&r.isVector3?r:new T,this.vertexNormals=Array.isArray(r)?r:[],this.color=n&&n.isColor?n:new Ae,this.vertexColors=Array.isArray(n)?n:[],this.materialIndex=a!==void 0?a:0}Object.assign(Yt.prototype,{clone:function(){return new this.constructor().copy(this)},copy:function(e){this.a=e.a,this.b=e.b,this.c=e.c,this.normal.copy(e.normal),this.color.copy(e.color),this.materialIndex=e.materialIndex;for(var t=0,i=e.vertexNormals.length;t<i;t++)this.vertexNormals[t]=e.vertexNormals[t].clone();for(var t=0,i=e.vertexColors.length;t<i;t++)this.vertexColors[t]=e.vertexColors[t].clone();return this}});var ma=0;function ze(){Object.defineProperty(this,"id",{value:ma++}),this.uuid=xe.generateUUID(),this.name="",this.type="Material",this.fog=!0,this.lights=!0,this.blending=Rt,this.side=Qt,this.flatShading=!1,this.vertexColors=sr,this.opacity=1,this.transparent=!1,this.blendSrc=or,this.blendDst=lr,this.blendEquation=_t,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.depthFunc=oi,this.depthTest=!0,this.depthWrite=!0,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaTest=0,this.premultipliedAlpha=!1,this.visible=!0,this.userData={},this.needsUpdate=!0}ze.prototype=Object.assign(Object.create(vt.prototype),{constructor:ze,isMaterial:!0,onBeforeCompile:function(){},setValues:function(e){if(e!==void 0)for(var t in e){var i=e[t];if(i===void 0){console.warn("THREE.Material: '"+t+"' parameter is undefined.");continue}if(t==="shading"){console.warn("THREE."+this.type+": .shading has been removed. Use the boolean .flatShading instead."),this.flatShading=i===tn;continue}var r=this[t];if(r===void 0){console.warn("THREE."+this.type+": '"+t+"' is not a property of this material.");continue}r&&r.isColor?r.set(i):r&&r.isVector3&&i&&i.isVector3?r.copy(i):this[t]=i}},toJSON:function(e){var t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});var i={metadata:{version:4.5,type:"Material",generator:"Material.toJSON"}};i.uuid=this.uuid,i.type=this.type,this.name!==""&&(i.name=this.name),this.color&&this.color.isColor&&(i.color=this.color.getHex()),this.roughness!==void 0&&(i.roughness=this.roughness),this.metalness!==void 0&&(i.metalness=this.metalness),this.emissive&&this.emissive.isColor&&(i.emissive=this.emissive.getHex()),this.emissiveIntensity!==1&&(i.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(i.specular=this.specular.getHex()),this.shininess!==void 0&&(i.shininess=this.shininess),this.clearCoat!==void 0&&(i.clearCoat=this.clearCoat),this.clearCoatRoughness!==void 0&&(i.clearCoatRoughness=this.clearCoatRoughness),this.map&&this.map.isTexture&&(i.map=this.map.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(i.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(i.lightMap=this.lightMap.toJSON(e).uuid),this.aoMap&&this.aoMap.isTexture&&(i.aoMap=this.aoMap.toJSON(e).uuid,i.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(i.bumpMap=this.bumpMap.toJSON(e).uuid,i.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(i.normalMap=this.normalMap.toJSON(e).uuid,i.normalMapType=this.normalMapType,i.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(i.displacementMap=this.displacementMap.toJSON(e).uuid,i.displacementScale=this.displacementScale,i.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(i.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(i.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(i.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(i.specularMap=this.specularMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(i.envMap=this.envMap.toJSON(e).uuid,i.reflectivity=this.reflectivity,this.combine!==void 0&&(i.combine=this.combine),this.envMapIntensity!==void 0&&(i.envMapIntensity=this.envMapIntensity)),this.gradientMap&&this.gradientMap.isTexture&&(i.gradientMap=this.gradientMap.toJSON(e).uuid),this.size!==void 0&&(i.size=this.size),this.sizeAttenuation!==void 0&&(i.sizeAttenuation=this.sizeAttenuation),this.blending!==Rt&&(i.blending=this.blending),this.flatShading===!0&&(i.flatShading=this.flatShading),this.side!==Qt&&(i.side=this.side),this.vertexColors!==sr&&(i.vertexColors=this.vertexColors),this.opacity<1&&(i.opacity=this.opacity),this.transparent===!0&&(i.transparent=this.transparent),i.depthFunc=this.depthFunc,i.depthTest=this.depthTest,i.depthWrite=this.depthWrite,this.rotation!==0&&(i.rotation=this.rotation),this.polygonOffset===!0&&(i.polygonOffset=!0),this.polygonOffsetFactor!==0&&(i.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(i.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==1&&(i.linewidth=this.linewidth),this.dashSize!==void 0&&(i.dashSize=this.dashSize),this.gapSize!==void 0&&(i.gapSize=this.gapSize),this.scale!==void 0&&(i.scale=this.scale),this.dithering===!0&&(i.dithering=!0),this.alphaTest>0&&(i.alphaTest=this.alphaTest),this.premultipliedAlpha===!0&&(i.premultipliedAlpha=this.premultipliedAlpha),this.wireframe===!0&&(i.wireframe=this.wireframe),this.wireframeLinewidth>1&&(i.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(i.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(i.wireframeLinejoin=this.wireframeLinejoin),this.morphTargets===!0&&(i.morphTargets=!0),this.skinning===!0&&(i.skinning=!0),this.visible===!1&&(i.visible=!1),JSON.stringify(this.userData)!=="{}"&&(i.userData=this.userData);function r(s){var o=[];for(var u in s){var l=s[u];delete l.metadata,o.push(l)}return o}if(t){var n=r(e.textures),a=r(e.images);n.length>0&&(i.textures=n),a.length>0&&(i.images=a)}return i},clone:function(){return new this.constructor().copy(this)},copy:function(e){this.name=e.name,this.fog=e.fog,this.lights=e.lights,this.blending=e.blending,this.side=e.side,this.flatShading=e.flatShading,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.premultipliedAlpha=e.premultipliedAlpha,this.visible=e.visible,this.userData=JSON.parse(JSON.stringify(e.userData)),this.clipShadows=e.clipShadows,this.clipIntersection=e.clipIntersection;var t=e.clippingPlanes,i=null;if(t!==null){var r=t.length;i=new Array(r);for(var n=0;n!==r;++n)i[n]=t[n].clone()}return this.clippingPlanes=i,this.shadowSide=e.shadowSide,this},dispose:function(){this.dispatchEvent({type:"dispose"})}});function Mt(e){ze.call(this),this.type="MeshBasicMaterial",this.color=new Ae(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.combine=ur,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.skinning=!1,this.morphTargets=!1,this.lights=!1,this.setValues(e)}Mt.prototype=Object.create(ze.prototype);Mt.prototype.constructor=Mt;Mt.prototype.isMeshBasicMaterial=!0;Mt.prototype.copy=function(e){return ze.prototype.copy.call(this,e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.skinning=e.skinning,this.morphTargets=e.morphTargets,this};function Me(e,t,i,r){this.x=e||0,this.y=t||0,this.z=i||0,this.w=r!==void 0?r:1}Object.assign(Me.prototype,{isVector4:!0,set:function(e,t,i,r){return this.x=e,this.y=t,this.z=i,this.w=r,this},setScalar:function(e){return this.x=e,this.y=e,this.z=e,this.w=e,this},setX:function(e){return this.x=e,this},setY:function(e){return this.y=e,this},setZ:function(e){return this.z=e,this},setW:function(e){return this.w=e,this},setComponent:function(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("index is out of range: "+e)}return this},getComponent:function(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+e)}},clone:function(){return new this.constructor(this.x,this.y,this.z,this.w)},copy:function(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this},add:function(e,t){return t!==void 0?(console.warn("THREE.Vector4: .add() now only accepts one argument. Use .addVectors( a, b ) instead."),this.addVectors(e,t)):(this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this)},addScalar:function(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this},addVectors:function(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this},addScaledVector:function(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this},sub:function(e,t){return t!==void 0?(console.warn("THREE.Vector4: .sub() now only accepts one argument. Use .subVectors( a, b ) instead."),this.subVectors(e,t)):(this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this)},subScalar:function(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this},subVectors:function(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this},multiplyScalar:function(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this},applyMatrix4:function(e){var t=this.x,i=this.y,r=this.z,n=this.w,a=e.elements;return this.x=a[0]*t+a[4]*i+a[8]*r+a[12]*n,this.y=a[1]*t+a[5]*i+a[9]*r+a[13]*n,this.z=a[2]*t+a[6]*i+a[10]*r+a[14]*n,this.w=a[3]*t+a[7]*i+a[11]*r+a[15]*n,this},divideScalar:function(e){return this.multiplyScalar(1/e)},setAxisAngleFromQuaternion:function(e){this.w=2*Math.acos(e.w);var t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this},setAxisAngleFromRotationMatrix:function(e){var t,i,r,n,a=.01,s=.1,o=e.elements,u=o[0],l=o[4],f=o[8],c=o[1],h=o[5],p=o[9],v=o[2],_=o[6],M=o[10];if(Math.abs(l-c)<a&&Math.abs(f-v)<a&&Math.abs(p-_)<a){if(Math.abs(l+c)<s&&Math.abs(f+v)<s&&Math.abs(p+_)<s&&Math.abs(u+h+M-3)<s)return this.set(1,0,0,0),this;t=Math.PI;var w=(u+1)/2,S=(h+1)/2,L=(M+1)/2,b=(l+c)/4,R=(f+v)/4,P=(p+_)/4;return w>S&&w>L?w<a?(i=0,r=.707106781,n=.707106781):(i=Math.sqrt(w),r=b/i,n=R/i):S>L?S<a?(i=.707106781,r=0,n=.707106781):(r=Math.sqrt(S),i=b/r,n=P/r):L<a?(i=.707106781,r=.707106781,n=0):(n=Math.sqrt(L),i=R/n,r=P/n),this.set(i,r,n,t),this}var U=Math.sqrt((_-p)*(_-p)+(f-v)*(f-v)+(c-l)*(c-l));return Math.abs(U)<.001&&(U=1),this.x=(_-p)/U,this.y=(f-v)/U,this.z=(c-l)/U,this.w=Math.acos((u+h+M-1)/2),this},min:function(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this},max:function(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this},clamp:function(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this.z=Math.max(e.z,Math.min(t.z,this.z)),this.w=Math.max(e.w,Math.min(t.w,this.w)),this},clampScalar:function(){var e,t;return function(r,n){return e===void 0&&(e=new Me,t=new Me),e.set(r,r,r,r),t.set(n,n,n,n),this.clamp(e,t)}}(),clampLength:function(e,t){var i=this.length();return this.divideScalar(i||1).multiplyScalar(Math.max(e,Math.min(t,i)))},floor:function(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this},ceil:function(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this},round:function(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this},roundToZero:function(){return this.x=this.x<0?Math.ceil(this.x):Math.floor(this.x),this.y=this.y<0?Math.ceil(this.y):Math.floor(this.y),this.z=this.z<0?Math.ceil(this.z):Math.floor(this.z),this.w=this.w<0?Math.ceil(this.w):Math.floor(this.w),this},negate:function(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this},dot:function(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w},lengthSq:function(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w},length:function(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)},manhattanLength:function(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)},normalize:function(){return this.divideScalar(this.length()||1)},setLength:function(e){return this.normalize().multiplyScalar(e)},lerp:function(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this},lerpVectors:function(e,t,i){return this.subVectors(t,e).multiplyScalar(i).add(e)},equals:function(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w},fromArray:function(e,t){return t===void 0&&(t=0),this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this},toArray:function(e,t){return e===void 0&&(e=[]),t===void 0&&(t=0),e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e},fromBufferAttribute:function(e,t,i){return i!==void 0&&console.warn("THREE.Vector4: offset has been removed from .fromBufferAttribute()."),this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}});function ve(e,t,i){if(Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=i===!0,this.dynamic=!1,this.updateRange={offset:0,count:-1},this.version=0}Object.defineProperty(ve.prototype,"needsUpdate",{set:function(e){e===!0&&this.version++}});Object.assign(ve.prototype,{isBufferAttribute:!0,onUploadCallback:function(){},setArray:function(e){if(Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");return this.count=e!==void 0?e.length/this.itemSize:0,this.array=e,this},setDynamic:function(e){return this.dynamic=e,this},copy:function(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.dynamic=e.dynamic,this},copyAt:function(e,t,i){e*=this.itemSize,i*=t.itemSize;for(var r=0,n=this.itemSize;r<n;r++)this.array[e+r]=t.array[i+r];return this},copyArray:function(e){return this.array.set(e),this},copyColorsArray:function(e){for(var t=this.array,i=0,r=0,n=e.length;r<n;r++){var a=e[r];a===void 0&&(console.warn("THREE.BufferAttribute.copyColorsArray(): color is undefined",r),a=new Ae),t[i++]=a.r,t[i++]=a.g,t[i++]=a.b}return this},copyVector2sArray:function(e){for(var t=this.array,i=0,r=0,n=e.length;r<n;r++){var a=e[r];a===void 0&&(console.warn("THREE.BufferAttribute.copyVector2sArray(): vector is undefined",r),a=new de),t[i++]=a.x,t[i++]=a.y}return this},copyVector3sArray:function(e){for(var t=this.array,i=0,r=0,n=e.length;r<n;r++){var a=e[r];a===void 0&&(console.warn("THREE.BufferAttribute.copyVector3sArray(): vector is undefined",r),a=new T),t[i++]=a.x,t[i++]=a.y,t[i++]=a.z}return this},copyVector4sArray:function(e){for(var t=this.array,i=0,r=0,n=e.length;r<n;r++){var a=e[r];a===void 0&&(console.warn("THREE.BufferAttribute.copyVector4sArray(): vector is undefined",r),a=new Me),t[i++]=a.x,t[i++]=a.y,t[i++]=a.z,t[i++]=a.w}return this},set:function(e,t){return t===void 0&&(t=0),this.array.set(e,t),this},getX:function(e){return this.array[e*this.itemSize]},setX:function(e,t){return this.array[e*this.itemSize]=t,this},getY:function(e){return this.array[e*this.itemSize+1]},setY:function(e,t){return this.array[e*this.itemSize+1]=t,this},getZ:function(e){return this.array[e*this.itemSize+2]},setZ:function(e,t){return this.array[e*this.itemSize+2]=t,this},getW:function(e){return this.array[e*this.itemSize+3]},setW:function(e,t){return this.array[e*this.itemSize+3]=t,this},setXY:function(e,t,i){return e*=this.itemSize,this.array[e+0]=t,this.array[e+1]=i,this},setXYZ:function(e,t,i,r){return e*=this.itemSize,this.array[e+0]=t,this.array[e+1]=i,this.array[e+2]=r,this},setXYZW:function(e,t,i,r,n){return e*=this.itemSize,this.array[e+0]=t,this.array[e+1]=i,this.array[e+2]=r,this.array[e+3]=n,this},onUpload:function(e){return this.onUploadCallback=e,this},clone:function(){return new this.constructor(this.array,this.itemSize).copy(this)}});function pi(e,t,i){ve.call(this,new Int8Array(e),t,i)}pi.prototype=Object.create(ve.prototype);pi.prototype.constructor=pi;function mi(e,t,i){ve.call(this,new Uint8Array(e),t,i)}mi.prototype=Object.create(ve.prototype);mi.prototype.constructor=mi;function vi(e,t,i){ve.call(this,new Uint8ClampedArray(e),t,i)}vi.prototype=Object.create(ve.prototype);vi.prototype.constructor=vi;function gi(e,t,i){ve.call(this,new Int16Array(e),t,i)}gi.prototype=Object.create(ve.prototype);gi.prototype.constructor=gi;function Ct(e,t,i){ve.call(this,new Uint16Array(e),t,i)}Ct.prototype=Object.create(ve.prototype);Ct.prototype.constructor=Ct;function _i(e,t,i){ve.call(this,new Int32Array(e),t,i)}_i.prototype=Object.create(ve.prototype);_i.prototype.constructor=_i;function Dt(e,t,i){ve.call(this,new Uint32Array(e),t,i)}Dt.prototype=Object.create(ve.prototype);Dt.prototype.constructor=Dt;function Oe(e,t,i){ve.call(this,new Float32Array(e),t,i)}Oe.prototype=Object.create(ve.prototype);Oe.prototype.constructor=Oe;function xi(e,t,i){ve.call(this,new Float64Array(e),t,i)}xi.prototype=Object.create(ve.prototype);xi.prototype.constructor=xi;function wr(){this.vertices=[],this.normals=[],this.colors=[],this.uvs=[],this.uvs2=[],this.groups=[],this.morphTargets={},this.skinWeights=[],this.skinIndices=[],this.boundingBox=null,this.boundingSphere=null,this.verticesNeedUpdate=!1,this.normalsNeedUpdate=!1,this.colorsNeedUpdate=!1,this.uvsNeedUpdate=!1,this.groupsNeedUpdate=!1}Object.assign(wr.prototype,{computeGroups:function(e){for(var t,i=[],r=void 0,n=e.faces,a=0;a<n.length;a++){var s=n[a];s.materialIndex!==r&&(r=s.materialIndex,t!==void 0&&(t.count=a*3-t.start,i.push(t)),t={start:a*3,materialIndex:r})}t!==void 0&&(t.count=a*3-t.start,i.push(t)),this.groups=i},fromGeometry:function(e){var t=e.faces,i=e.vertices,r=e.faceVertexUvs,n=r[0]&&r[0].length>0,a=r[1]&&r[1].length>0,s=e.morphTargets,o=s.length,u;if(o>0){u=[];for(var l=0;l<o;l++)u[l]={name:s[l].name,data:[]};this.morphTargets.position=u}var f=e.morphNormals,c=f.length,h;if(c>0){h=[];for(var l=0;l<c;l++)h[l]={name:f[l].name,data:[]};this.morphTargets.normal=h}var p=e.skinIndices,v=e.skinWeights,_=p.length===i.length,M=v.length===i.length;i.length>0&&t.length===0&&console.error("THREE.DirectGeometry: Faceless geometries are not supported.");for(var l=0;l<t.length;l++){var w=t[l];this.vertices.push(i[w.a],i[w.b],i[w.c]);var S=w.vertexNormals;if(S.length===3)this.normals.push(S[0],S[1],S[2]);else{var L=w.normal;this.normals.push(L,L,L)}var b=w.vertexColors;if(b.length===3)this.colors.push(b[0],b[1],b[2]);else{var R=w.color;this.colors.push(R,R,R)}if(n===!0){var P=r[0][l];P!==void 0?this.uvs.push(P[0],P[1],P[2]):(console.warn("THREE.DirectGeometry.fromGeometry(): Undefined vertexUv ",l),this.uvs.push(new de,new de,new de))}if(a===!0){var P=r[1][l];P!==void 0?this.uvs2.push(P[0],P[1],P[2]):(console.warn("THREE.DirectGeometry.fromGeometry(): Undefined vertexUv2 ",l),this.uvs2.push(new de,new de,new de))}for(var U=0;U<o;U++){var D=s[U].vertices;u[U].data.push(D[w.a],D[w.b],D[w.c])}for(var U=0;U<c;U++){var A=f[U].vertexNormals[l];h[U].data.push(A.a,A.b,A.c)}_&&this.skinIndices.push(p[w.a],p[w.b],p[w.c]),M&&this.skinWeights.push(v[w.a],v[w.b],v[w.c])}return this.computeGroups(e),this.verticesNeedUpdate=e.verticesNeedUpdate,this.normalsNeedUpdate=e.normalsNeedUpdate,this.colorsNeedUpdate=e.colorsNeedUpdate,this.uvsNeedUpdate=e.uvsNeedUpdate,this.groupsNeedUpdate=e.groupsNeedUpdate,this}});function br(e){if(e.length===0)return-1/0;for(var t=e[0],i=1,r=e.length;i<r;++i)e[i]>t&&(t=e[i]);return t}var va=1;function Ke(){Object.defineProperty(this,"id",{value:va+=2}),this.uuid=xe.generateUUID(),this.name="",this.type="BufferGeometry",this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}Ke.prototype=Object.assign(Object.create(vt.prototype),{constructor:Ke,isBufferGeometry:!0,getIndex:function(){return this.index},setIndex:function(e){Array.isArray(e)?this.index=new(br(e)>65535?Dt:Ct)(e,1):this.index=e},addAttribute:function(e,t){return!(t&&t.isBufferAttribute)&&!(t&&t.isInterleavedBufferAttribute)?(console.warn("THREE.BufferGeometry: .addAttribute() now expects ( name, attribute )."),this.addAttribute(e,new ve(arguments[1],arguments[2]))):e==="index"?(console.warn("THREE.BufferGeometry.addAttribute: Use .setIndex() for index attribute."),this.setIndex(t),this):(this.attributes[e]=t,this)},getAttribute:function(e){return this.attributes[e]},removeAttribute:function(e){return delete this.attributes[e],this},addGroup:function(e,t,i){this.groups.push({start:e,count:t,materialIndex:i!==void 0?i:0})},clearGroups:function(){this.groups=[]},setDrawRange:function(e,t){this.drawRange.start=e,this.drawRange.count=t},applyMatrix:function(e){var t=this.attributes.position;t!==void 0&&(e.applyToBufferAttribute(t),t.needsUpdate=!0);var i=this.attributes.normal;if(i!==void 0){var r=new je().getNormalMatrix(e);r.applyToBufferAttribute(i),i.needsUpdate=!0}return this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this},rotateX:function(){var e=new pe;return function(i){return e.makeRotationX(i),this.applyMatrix(e),this}}(),rotateY:function(){var e=new pe;return function(i){return e.makeRotationY(i),this.applyMatrix(e),this}}(),rotateZ:function(){var e=new pe;return function(i){return e.makeRotationZ(i),this.applyMatrix(e),this}}(),translate:function(){var e=new pe;return function(i,r,n){return e.makeTranslation(i,r,n),this.applyMatrix(e),this}}(),scale:function(){var e=new pe;return function(i,r,n){return e.makeScale(i,r,n),this.applyMatrix(e),this}}(),lookAt:function(){var e=new we;return function(i){e.lookAt(i),e.updateMatrix(),this.applyMatrix(e.matrix)}}(),center:function(){var e=new T;return function(){return this.computeBoundingBox(),this.boundingBox.getCenter(e).negate(),this.translate(e.x,e.y,e.z),this}}(),setFromObject:function(e){var t=e.geometry;if(e.isPoints||e.isLine){var i=new Oe(t.vertices.length*3,3),r=new Oe(t.colors.length*3,3);if(this.addAttribute("position",i.copyVector3sArray(t.vertices)),this.addAttribute("color",r.copyColorsArray(t.colors)),t.lineDistances&&t.lineDistances.length===t.vertices.length){var n=new Oe(t.lineDistances.length,1);this.addAttribute("lineDistance",n.copyArray(t.lineDistances))}t.boundingSphere!==null&&(this.boundingSphere=t.boundingSphere.clone()),t.boundingBox!==null&&(this.boundingBox=t.boundingBox.clone())}else e.isMesh&&t&&t.isGeometry&&this.fromGeometry(t);return this},setFromPoints:function(e){for(var t=[],i=0,r=e.length;i<r;i++){var n=e[i];t.push(n.x,n.y,n.z||0)}return this.addAttribute("position",new Oe(t,3)),this},updateFromObject:function(e){var t=e.geometry;if(e.isMesh){var i=t.__directGeometry;if(t.elementsNeedUpdate===!0&&(i=void 0,t.elementsNeedUpdate=!1),i===void 0)return this.fromGeometry(t);i.verticesNeedUpdate=t.verticesNeedUpdate,i.normalsNeedUpdate=t.normalsNeedUpdate,i.colorsNeedUpdate=t.colorsNeedUpdate,i.uvsNeedUpdate=t.uvsNeedUpdate,i.groupsNeedUpdate=t.groupsNeedUpdate,t.verticesNeedUpdate=!1,t.normalsNeedUpdate=!1,t.colorsNeedUpdate=!1,t.uvsNeedUpdate=!1,t.groupsNeedUpdate=!1,t=i}var r;return t.verticesNeedUpdate===!0&&(r=this.attributes.position,r!==void 0&&(r.copyVector3sArray(t.vertices),r.needsUpdate=!0),t.verticesNeedUpdate=!1),t.normalsNeedUpdate===!0&&(r=this.attributes.normal,r!==void 0&&(r.copyVector3sArray(t.normals),r.needsUpdate=!0),t.normalsNeedUpdate=!1),t.colorsNeedUpdate===!0&&(r=this.attributes.color,r!==void 0&&(r.copyColorsArray(t.colors),r.needsUpdate=!0),t.colorsNeedUpdate=!1),t.uvsNeedUpdate&&(r=this.attributes.uv,r!==void 0&&(r.copyVector2sArray(t.uvs),r.needsUpdate=!0),t.uvsNeedUpdate=!1),t.lineDistancesNeedUpdate&&(r=this.attributes.lineDistance,r!==void 0&&(r.copyArray(t.lineDistances),r.needsUpdate=!0),t.lineDistancesNeedUpdate=!1),t.groupsNeedUpdate&&(t.computeGroups(e.geometry),this.groups=t.groups,t.groupsNeedUpdate=!1),this},fromGeometry:function(e){return e.__directGeometry=new wr().fromGeometry(e),this.fromDirectGeometry(e.__directGeometry)},fromDirectGeometry:function(e){var t=new Float32Array(e.vertices.length*3);if(this.addAttribute("position",new ve(t,3).copyVector3sArray(e.vertices)),e.normals.length>0){var i=new Float32Array(e.normals.length*3);this.addAttribute("normal",new ve(i,3).copyVector3sArray(e.normals))}if(e.colors.length>0){var r=new Float32Array(e.colors.length*3);this.addAttribute("color",new ve(r,3).copyColorsArray(e.colors))}if(e.uvs.length>0){var n=new Float32Array(e.uvs.length*2);this.addAttribute("uv",new ve(n,2).copyVector2sArray(e.uvs))}if(e.uvs2.length>0){var a=new Float32Array(e.uvs2.length*2);this.addAttribute("uv2",new ve(a,2).copyVector2sArray(e.uvs2))}this.groups=e.groups;for(var s in e.morphTargets){for(var o=[],u=e.morphTargets[s],l=0,f=u.length;l<f;l++){var c=u[l],h=new Oe(c.data.length*3,3);h.name=c.name,o.push(h.copyVector3sArray(c.data))}this.morphAttributes[s]=o}if(e.skinIndices.length>0){var p=new Oe(e.skinIndices.length*4,4);this.addAttribute("skinIndex",p.copyVector4sArray(e.skinIndices))}if(e.skinWeights.length>0){var v=new Oe(e.skinWeights.length*4,4);this.addAttribute("skinWeight",v.copyVector4sArray(e.skinWeights))}return e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),this},computeBoundingBox:function(){this.boundingBox===null&&(this.boundingBox=new yt);var e=this.attributes.position;e!==void 0?this.boundingBox.setFromBufferAttribute(e):this.boundingBox.makeEmpty(),(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error('THREE.BufferGeometry.computeBoundingBox: Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)},computeBoundingSphere:function(){var e=new yt,t=new T;return function(){this.boundingSphere===null&&(this.boundingSphere=new mt);var r=this.attributes.position;if(r){var n=this.boundingSphere.center;e.setFromBufferAttribute(r),e.getCenter(n);for(var a=0,s=0,o=r.count;s<o;s++)t.x=r.getX(s),t.y=r.getY(s),t.z=r.getZ(s),a=Math.max(a,n.distanceToSquared(t));this.boundingSphere.radius=Math.sqrt(a),isNaN(this.boundingSphere.radius)&&console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}}(),computeFaceNormals:function(){},computeVertexNormals:function(){var e=this.index,t=this.attributes;if(t.position){var i=t.position.array;if(t.normal===void 0)this.addAttribute("normal",new ve(new Float32Array(i.length),3));else for(var r=t.normal.array,n=0,a=r.length;n<a;n++)r[n]=0;var s=t.normal.array,o,u,l,f=new T,c=new T,h=new T,p=new T,v=new T;if(e)for(var _=e.array,n=0,a=e.count;n<a;n+=3)o=_[n+0]*3,u=_[n+1]*3,l=_[n+2]*3,f.fromArray(i,o),c.fromArray(i,u),h.fromArray(i,l),p.subVectors(h,c),v.subVectors(f,c),p.cross(v),s[o]+=p.x,s[o+1]+=p.y,s[o+2]+=p.z,s[u]+=p.x,s[u+1]+=p.y,s[u+2]+=p.z,s[l]+=p.x,s[l+1]+=p.y,s[l+2]+=p.z;else for(var n=0,a=i.length;n<a;n+=9)f.fromArray(i,n),c.fromArray(i,n+3),h.fromArray(i,n+6),p.subVectors(h,c),v.subVectors(f,c),p.cross(v),s[n]=p.x,s[n+1]=p.y,s[n+2]=p.z,s[n+3]=p.x,s[n+4]=p.y,s[n+5]=p.z,s[n+6]=p.x,s[n+7]=p.y,s[n+8]=p.z;this.normalizeNormals(),t.normal.needsUpdate=!0}},merge:function(e,t){if(!(e&&e.isBufferGeometry)){console.error("THREE.BufferGeometry.merge(): geometry not an instance of THREE.BufferGeometry.",e);return}t===void 0&&(t=0,console.warn("THREE.BufferGeometry.merge(): Overwriting original geometry, starting at offset=0. Use BufferGeometryUtils.mergeBufferGeometries() for lossless merge."));var i=this.attributes;for(var r in i)if(e.attributes[r]!==void 0)for(var n=i[r],a=n.array,s=e.attributes[r],o=s.array,u=s.itemSize,l=0,f=u*t;l<o.length;l++,f++)a[f]=o[l];return this},normalizeNormals:function(){var e=new T;return function(){for(var i=this.attributes.normal,r=0,n=i.count;r<n;r++)e.x=i.getX(r),e.y=i.getY(r),e.z=i.getZ(r),e.normalize(),i.setXYZ(r,e.x,e.y,e.z)}}(),toNonIndexed:function(){function e(_,M){for(var w=_.array,S=_.itemSize,L=new w.constructor(M.length*S),b=0,R=0,P=0,U=M.length;P<U;P++){b=M[P]*S;for(var D=0;D<S;D++)L[R++]=w[b++]}return new ve(L,S)}if(this.index===null)return console.warn("THREE.BufferGeometry.toNonIndexed(): Geometry is already non-indexed."),this;var t=new Ke,i=this.index.array,r=this.attributes;for(var n in r){var a=r[n],s=e(a,i);t.addAttribute(n,s)}var o=this.morphAttributes;for(n in o){for(var u=[],l=o[n],f=0,c=l.length;f<c;f++){var a=l[f],s=e(a,i);u.push(s)}t.morphAttributes[n]=u}for(var h=this.groups,f=0,p=h.length;f<p;f++){var v=h[f];t.addGroup(v.start,v.count,v.materialIndex)}return t},toJSON:function(){var e={metadata:{version:4.5,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.type,this.name!==""&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0){var t=this.parameters;for(var i in t)t[i]!==void 0&&(e[i]=t[i]);return e}e.data={attributes:{}};var r=this.index;if(r!==null){var n=Array.prototype.slice.call(r.array);e.data.index={type:r.array.constructor.name,array:n}}var a=this.attributes;for(var i in a){var s=a[i],n=Array.prototype.slice.call(s.array);e.data.attributes[i]={itemSize:s.itemSize,type:s.array.constructor.name,array:n,normalized:s.normalized}}var o=this.groups;o.length>0&&(e.data.groups=JSON.parse(JSON.stringify(o)));var u=this.boundingSphere;return u!==null&&(e.data.boundingSphere={center:u.center.toArray(),radius:u.radius}),e},clone:function(){return new Ke().copy(this)},copy:function(e){var t,i,r;this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.name=e.name;var n=e.index;n!==null&&this.setIndex(n.clone());var a=e.attributes;for(t in a){var s=a[t];this.addAttribute(t,s.clone())}var o=e.morphAttributes;for(t in o){var u=[],l=o[t];for(i=0,r=l.length;i<r;i++)u.push(l[i].clone());this.morphAttributes[t]=u}var f=e.groups;for(i=0,r=f.length;i<r;i++){var c=f[i];this.addGroup(c.start,c.count,c.materialIndex)}var h=e.boundingBox;h!==null&&(this.boundingBox=h.clone());var p=e.boundingSphere;return p!==null&&(this.boundingSphere=p.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this},dispose:function(){this.dispatchEvent({type:"dispose"})}});function Ft(e,t){we.call(this),this.type="Mesh",this.geometry=e!==void 0?e:new Ke,this.material=t!==void 0?t:new Mt({color:Math.random()*16777215}),this.drawMode=xr,this.updateMorphTargets()}Ft.prototype=Object.assign(Object.create(we.prototype),{constructor:Ft,isMesh:!0,setDrawMode:function(e){this.drawMode=e},copy:function(e){return we.prototype.copy.call(this,e),this.drawMode=e.drawMode,e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this},updateMorphTargets:function(){var e=this.geometry,t,i,r;if(e.isBufferGeometry){var n=e.morphAttributes,a=Object.keys(n);if(a.length>0){var s=n[a[0]];if(s!==void 0)for(this.morphTargetInfluences=[],this.morphTargetDictionary={},t=0,i=s.length;t<i;t++)r=s[t].name||String(t),this.morphTargetInfluences.push(0),this.morphTargetDictionary[r]=t}}else{var o=e.morphTargets;o!==void 0&&o.length>0&&console.error("THREE.Mesh.updateMorphTargets() no longer supports THREE.Geometry. Use THREE.BufferGeometry instead.")}},raycast:function(){var e=new pe,t=new Mr,i=new mt,r=new T,n=new T,a=new T,s=new T,o=new T,u=new T,l=new de,f=new de,c=new de,h=new T,p=new T;function v(M,w,S,L,b,R,P,U){var D;if(w.side===We?D=L.intersectTriangle(P,R,b,!0,U):D=L.intersectTriangle(b,R,P,w.side!==Kt,U),D===null)return null;p.copy(U),p.applyMatrix4(M.matrixWorld);var A=S.ray.origin.distanceTo(p);return A<S.near||A>S.far?null:{distance:A,point:p.clone(),object:M}}function _(M,w,S,L,b,R,P,U,D){r.fromBufferAttribute(b,P),n.fromBufferAttribute(b,U),a.fromBufferAttribute(b,D);var A=v(M,w,S,L,r,n,a,h);if(A){R&&(l.fromBufferAttribute(R,P),f.fromBufferAttribute(R,U),c.fromBufferAttribute(R,D),A.uv=Qe.getUV(h,r,n,a,l,f,c,new de));var F=new Yt(P,U,D);Qe.getNormal(r,n,a,F.normal),A.face=F}return A}return function(w,S){var L=this.geometry,b=this.material,R=this.matrixWorld;if(b!==void 0&&(L.boundingSphere===null&&L.computeBoundingSphere(),i.copy(L.boundingSphere),i.applyMatrix4(R),w.ray.intersectsSphere(i)!==!1&&(e.getInverse(R),t.copy(w.ray).applyMatrix4(e),!(L.boundingBox!==null&&t.intersectsBox(L.boundingBox)===!1)))){var P;if(L.isBufferGeometry){var U,D,A,F=L.index,N=L.attributes.position,H=L.attributes.uv,z=L.groups,k=L.drawRange,q,Q,K,X,g,x,I,E;if(F!==null)if(Array.isArray(b))for(q=0,K=z.length;q<K;q++)for(g=z[q],x=b[g.materialIndex],I=Math.max(g.start,k.start),E=Math.min(g.start+g.count,k.start+k.count),Q=I,X=E;Q<X;Q+=3)U=F.getX(Q),D=F.getX(Q+1),A=F.getX(Q+2),P=_(this,x,w,t,N,H,U,D,A),P&&(P.faceIndex=Math.floor(Q/3),S.push(P));else for(I=Math.max(0,k.start),E=Math.min(F.count,k.start+k.count),q=I,K=E;q<K;q+=3)U=F.getX(q),D=F.getX(q+1),A=F.getX(q+2),P=_(this,b,w,t,N,H,U,D,A),P&&(P.faceIndex=Math.floor(q/3),S.push(P));else if(N!==void 0)if(Array.isArray(b))for(q=0,K=z.length;q<K;q++)for(g=z[q],x=b[g.materialIndex],I=Math.max(g.start,k.start),E=Math.min(g.start+g.count,k.start+k.count),Q=I,X=E;Q<X;Q+=3)U=Q,D=Q+1,A=Q+2,P=_(this,x,w,t,N,H,U,D,A),P&&(P.faceIndex=Math.floor(Q/3),S.push(P));else for(I=Math.max(0,k.start),E=Math.min(N.count,k.start+k.count),q=I,K=E;q<K;q+=3)U=q,D=q+1,A=q+2,P=_(this,b,w,t,N,H,U,D,A),P&&(P.faceIndex=Math.floor(q/3),S.push(P))}else if(L.isGeometry){var J,O,G,V=Array.isArray(b),re=L.vertices,te=L.faces,ee,ce=L.faceVertexUvs[0];ce.length>0&&(ee=ce);for(var le=0,Re=te.length;le<Re;le++){var ge=te[le],qe=V?b[ge.materialIndex]:b;if(qe!==void 0){if(J=re[ge.a],O=re[ge.b],G=re[ge.c],qe.morphTargets===!0){var Ve=L.morphTargets,He=this.morphTargetInfluences;r.set(0,0,0),n.set(0,0,0),a.set(0,0,0);for(var $e=0,dt=Ve.length;$e<dt;$e++){var et=He[$e];if(et!==0){var Fe=Ve[$e].vertices;r.addScaledVector(s.subVectors(Fe[ge.a],J),et),n.addScaledVector(o.subVectors(Fe[ge.b],O),et),a.addScaledVector(u.subVectors(Fe[ge.c],G),et)}}r.add(J),n.add(O),a.add(G),J=r,O=n,G=a}if(P=v(this,qe,w,t,J,O,G,h),P){if(ee&&ee[le]){var at=ee[le];l.copy(at[0]),f.copy(at[1]),c.copy(at[2]),P.uv=Qe.getUV(h,J,O,G,l,f,c,new de)}P.face=ge,P.faceIndex=le,S.push(P)}}}}}}}(),clone:function(){return new this.constructor(this.geometry,this.material).copy(this)}});function ct(){we.call(this),this.type="Camera",this.matrixWorldInverse=new pe,this.projectionMatrix=new pe,this.projectionMatrixInverse=new pe}ct.prototype=Object.assign(Object.create(we.prototype),{constructor:ct,isCamera:!0,copy:function(e,t){return we.prototype.copy.call(this,e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this},getWorldDirection:function(e){e===void 0&&(console.warn("THREE.Camera: .getWorldDirection() target is now required"),e=new T),this.updateMatrixWorld(!0);var t=this.matrixWorld.elements;return e.set(-t[8],-t[9],-t[10]).normalize()},updateMatrixWorld:function(e){we.prototype.updateMatrixWorld.call(this,e),this.matrixWorldInverse.getInverse(this.matrixWorld)},clone:function(){return new this.constructor().copy(this)}});function yi(e,t,i,r,n,a){ct.call(this),this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e!==void 0?e:-1,this.right=t!==void 0?t:1,this.top=i!==void 0?i:1,this.bottom=r!==void 0?r:-1,this.near=n!==void 0?n:.1,this.far=a!==void 0?a:2e3,this.updateProjectionMatrix()}yi.prototype=Object.assign(Object.create(ct.prototype),{constructor:yi,isOrthographicCamera:!0,copy:function(e,t){return ct.prototype.copy.call(this,e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this},setViewOffset:function(e,t,i,r,n,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=i,this.view.offsetY=r,this.view.width=n,this.view.height=a,this.updateProjectionMatrix()},clearViewOffset:function(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()},updateProjectionMatrix:function(){var e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),i=(this.right+this.left)/2,r=(this.top+this.bottom)/2,n=i-e,a=i+e,s=r+t,o=r-t;if(this.view!==null&&this.view.enabled){var u=this.zoom/(this.view.width/this.view.fullWidth),l=this.zoom/(this.view.height/this.view.fullHeight),f=(this.right-this.left)/this.view.width,c=(this.top-this.bottom)/this.view.height;n+=f*(this.view.offsetX/u),a=n+f*(this.view.width/u),s-=c*(this.view.offsetY/l),o=s-c*(this.view.height/l)}this.projectionMatrix.makeOrthographic(n,a,s,o,this.near,this.far),this.projectionMatrixInverse.getInverse(this.projectionMatrix)},toJSON:function(e){var t=we.prototype.toJSON.call(this,e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}});var ga=0;function lt(){Object.defineProperty(this,"id",{value:ga+=2}),this.uuid=xe.generateUUID(),this.name="",this.type="Geometry",this.vertices=[],this.colors=[],this.faces=[],this.faceVertexUvs=[[]],this.morphTargets=[],this.morphNormals=[],this.skinWeights=[],this.skinIndices=[],this.lineDistances=[],this.boundingBox=null,this.boundingSphere=null,this.elementsNeedUpdate=!1,this.verticesNeedUpdate=!1,this.uvsNeedUpdate=!1,this.normalsNeedUpdate=!1,this.colorsNeedUpdate=!1,this.lineDistancesNeedUpdate=!1,this.groupsNeedUpdate=!1}lt.prototype=Object.assign(Object.create(vt.prototype),{constructor:lt,isGeometry:!0,applyMatrix:function(e){for(var t=new je().getNormalMatrix(e),i=0,r=this.vertices.length;i<r;i++){var n=this.vertices[i];n.applyMatrix4(e)}for(var i=0,r=this.faces.length;i<r;i++){var a=this.faces[i];a.normal.applyMatrix3(t).normalize();for(var s=0,o=a.vertexNormals.length;s<o;s++)a.vertexNormals[s].applyMatrix3(t).normalize()}return this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this.verticesNeedUpdate=!0,this.normalsNeedUpdate=!0,this},rotateX:function(){var e=new pe;return function(i){return e.makeRotationX(i),this.applyMatrix(e),this}}(),rotateY:function(){var e=new pe;return function(i){return e.makeRotationY(i),this.applyMatrix(e),this}}(),rotateZ:function(){var e=new pe;return function(i){return e.makeRotationZ(i),this.applyMatrix(e),this}}(),translate:function(){var e=new pe;return function(i,r,n){return e.makeTranslation(i,r,n),this.applyMatrix(e),this}}(),scale:function(){var e=new pe;return function(i,r,n){return e.makeScale(i,r,n),this.applyMatrix(e),this}}(),lookAt:function(){var e=new we;return function(i){e.lookAt(i),e.updateMatrix(),this.applyMatrix(e.matrix)}}(),fromBufferGeometry:function(e){var t=this,i=e.index!==null?e.index.array:void 0,r=e.attributes,n=r.position.array,a=r.normal!==void 0?r.normal.array:void 0,s=r.color!==void 0?r.color.array:void 0,o=r.uv!==void 0?r.uv.array:void 0,u=r.uv2!==void 0?r.uv2.array:void 0;u!==void 0&&(this.faceVertexUvs[1]=[]);for(var l=0,f=0;l<n.length;l+=3,f+=2)t.vertices.push(new T().fromArray(n,l)),s!==void 0&&t.colors.push(new Ae().fromArray(s,l));function c(w,S,L,b){var R=s===void 0?[]:[t.colors[w].clone(),t.colors[S].clone(),t.colors[L].clone()],P=a===void 0?[]:[new T().fromArray(a,w*3),new T().fromArray(a,S*3),new T().fromArray(a,L*3)],U=new Yt(w,S,L,P,R,b);t.faces.push(U),o!==void 0&&t.faceVertexUvs[0].push([new de().fromArray(o,w*2),new de().fromArray(o,S*2),new de().fromArray(o,L*2)]),u!==void 0&&t.faceVertexUvs[1].push([new de().fromArray(u,w*2),new de().fromArray(u,S*2),new de().fromArray(u,L*2)])}var h=e.groups;if(h.length>0)for(var l=0;l<h.length;l++)for(var p=h[l],v=p.start,_=p.count,f=v,M=v+_;f<M;f+=3)i!==void 0?c(i[f],i[f+1],i[f+2],p.materialIndex):c(f,f+1,f+2,p.materialIndex);else if(i!==void 0)for(var l=0;l<i.length;l+=3)c(i[l],i[l+1],i[l+2]);else for(var l=0;l<n.length/3;l+=3)c(l,l+1,l+2);return this.computeFaceNormals(),e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this},center:function(){var e=new T;return function(){return this.computeBoundingBox(),this.boundingBox.getCenter(e).negate(),this.translate(e.x,e.y,e.z),this}}(),normalize:function(){this.computeBoundingSphere();var e=this.boundingSphere.center,t=this.boundingSphere.radius,i=t===0?1:1/t,r=new pe;return r.set(i,0,0,-i*e.x,0,i,0,-i*e.y,0,0,i,-i*e.z,0,0,0,1),this.applyMatrix(r),this},computeFaceNormals:function(){for(var e=new T,t=new T,i=0,r=this.faces.length;i<r;i++){var n=this.faces[i],a=this.vertices[n.a],s=this.vertices[n.b],o=this.vertices[n.c];e.subVectors(o,s),t.subVectors(a,s),e.cross(t),e.normalize(),n.normal.copy(e)}},computeVertexNormals:function(e){e===void 0&&(e=!0);var t,i,r,n,a,s;for(s=new Array(this.vertices.length),t=0,i=this.vertices.length;t<i;t++)s[t]=new T;if(e){var o,u,l,f=new T,c=new T;for(r=0,n=this.faces.length;r<n;r++)a=this.faces[r],o=this.vertices[a.a],u=this.vertices[a.b],l=this.vertices[a.c],f.subVectors(l,u),c.subVectors(o,u),f.cross(c),s[a.a].add(f),s[a.b].add(f),s[a.c].add(f)}else for(this.computeFaceNormals(),r=0,n=this.faces.length;r<n;r++)a=this.faces[r],s[a.a].add(a.normal),s[a.b].add(a.normal),s[a.c].add(a.normal);for(t=0,i=this.vertices.length;t<i;t++)s[t].normalize();for(r=0,n=this.faces.length;r<n;r++){a=this.faces[r];var h=a.vertexNormals;h.length===3?(h[0].copy(s[a.a]),h[1].copy(s[a.b]),h[2].copy(s[a.c])):(h[0]=s[a.a].clone(),h[1]=s[a.b].clone(),h[2]=s[a.c].clone())}this.faces.length>0&&(this.normalsNeedUpdate=!0)},computeFlatVertexNormals:function(){var e,t,i;for(this.computeFaceNormals(),e=0,t=this.faces.length;e<t;e++){i=this.faces[e];var r=i.vertexNormals;r.length===3?(r[0].copy(i.normal),r[1].copy(i.normal),r[2].copy(i.normal)):(r[0]=i.normal.clone(),r[1]=i.normal.clone(),r[2]=i.normal.clone())}this.faces.length>0&&(this.normalsNeedUpdate=!0)},computeMorphNormals:function(){var e,t,i,r,n;for(i=0,r=this.faces.length;i<r;i++)for(n=this.faces[i],n.__originalFaceNormal?n.__originalFaceNormal.copy(n.normal):n.__originalFaceNormal=n.normal.clone(),n.__originalVertexNormals||(n.__originalVertexNormals=[]),e=0,t=n.vertexNormals.length;e<t;e++)n.__originalVertexNormals[e]?n.__originalVertexNormals[e].copy(n.vertexNormals[e]):n.__originalVertexNormals[e]=n.vertexNormals[e].clone();var a=new lt;for(a.faces=this.faces,e=0,t=this.morphTargets.length;e<t;e++){if(!this.morphNormals[e]){this.morphNormals[e]={},this.morphNormals[e].faceNormals=[],this.morphNormals[e].vertexNormals=[];var s=this.morphNormals[e].faceNormals,o=this.morphNormals[e].vertexNormals,l,f;for(i=0,r=this.faces.length;i<r;i++)l=new T,f={a:new T,b:new T,c:new T},s.push(l),o.push(f)}var u=this.morphNormals[e];a.vertices=this.morphTargets[e].vertices,a.computeFaceNormals(),a.computeVertexNormals();var l,f;for(i=0,r=this.faces.length;i<r;i++)n=this.faces[i],l=u.faceNormals[i],f=u.vertexNormals[i],l.copy(n.normal),f.a.copy(n.vertexNormals[0]),f.b.copy(n.vertexNormals[1]),f.c.copy(n.vertexNormals[2])}for(i=0,r=this.faces.length;i<r;i++)n=this.faces[i],n.normal=n.__originalFaceNormal,n.vertexNormals=n.__originalVertexNormals},computeBoundingBox:function(){this.boundingBox===null&&(this.boundingBox=new yt),this.boundingBox.setFromPoints(this.vertices)},computeBoundingSphere:function(){this.boundingSphere===null&&(this.boundingSphere=new mt),this.boundingSphere.setFromPoints(this.vertices)},merge:function(e,t,i){if(!(e&&e.isGeometry)){console.error("THREE.Geometry.merge(): geometry not an instance of THREE.Geometry.",e);return}var r,n=this.vertices.length,a=this.vertices,s=e.vertices,o=this.faces,u=e.faces,l=this.faceVertexUvs[0],f=e.faceVertexUvs[0],c=this.colors,h=e.colors;i===void 0&&(i=0),t!==void 0&&(r=new je().getNormalMatrix(t));for(var p=0,v=s.length;p<v;p++){var _=s[p],M=_.clone();t!==void 0&&M.applyMatrix4(t),a.push(M)}for(var p=0,v=h.length;p<v;p++)c.push(h[p].clone());for(p=0,v=u.length;p<v;p++){var w=u[p],S,L,b,R=w.vertexNormals,P=w.vertexColors;S=new Yt(w.a+n,w.b+n,w.c+n),S.normal.copy(w.normal),r!==void 0&&S.normal.applyMatrix3(r).normalize();for(var U=0,D=R.length;U<D;U++)L=R[U].clone(),r!==void 0&&L.applyMatrix3(r).normalize(),S.vertexNormals.push(L);S.color.copy(w.color);for(var U=0,D=P.length;U<D;U++)b=P[U],S.vertexColors.push(b.clone());S.materialIndex=w.materialIndex+i,o.push(S)}for(p=0,v=f.length;p<v;p++){var A=f[p],F=[];if(A!==void 0){for(var U=0,D=A.length;U<D;U++)F.push(A[U].clone());l.push(F)}}},mergeMesh:function(e){if(!(e&&e.isMesh)){console.error("THREE.Geometry.mergeMesh(): mesh not an instance of THREE.Mesh.",e);return}e.matrixAutoUpdate&&e.updateMatrix(),this.merge(e.geometry,e.matrix)},mergeVertices:function(){var e={},t=[],i=[],r,n,a=4,s=Math.pow(10,a),o,u,l,f,c,h;for(o=0,u=this.vertices.length;o<u;o++)r=this.vertices[o],n=Math.round(r.x*s)+"_"+Math.round(r.y*s)+"_"+Math.round(r.z*s),e[n]===void 0?(e[n]=o,t.push(this.vertices[o]),i[o]=t.length-1):i[o]=i[e[n]];var p=[];for(o=0,u=this.faces.length;o<u;o++){l=this.faces[o],l.a=i[l.a],l.b=i[l.b],l.c=i[l.c],f=[l.a,l.b,l.c];for(var v=0;v<3;v++)if(f[v]===f[(v+1)%3]){p.push(o);break}}for(o=p.length-1;o>=0;o--){var _=p[o];for(this.faces.splice(_,1),c=0,h=this.faceVertexUvs.length;c<h;c++)this.faceVertexUvs[c].splice(_,1)}var M=this.vertices.length-t.length;return this.vertices=t,M},setFromPoints:function(e){this.vertices=[];for(var t=0,i=e.length;t<i;t++){var r=e[t];this.vertices.push(new T(r.x,r.y,r.z||0))}return this},sortFacesByMaterialIndex:function(){for(var e=this.faces,t=e.length,i=0;i<t;i++)e[i]._id=i;function r(l,f){return l.materialIndex-f.materialIndex}e.sort(r);var n=this.faceVertexUvs[0],a=this.faceVertexUvs[1],s,o;n&&n.length===t&&(s=[]),a&&a.length===t&&(o=[]);for(var i=0;i<t;i++){var u=e[i]._id;s&&s.push(n[u]),o&&o.push(a[u])}s&&(this.faceVertexUvs[0]=s),o&&(this.faceVertexUvs[1]=o)},toJSON:function(){var e={metadata:{version:4.5,type:"Geometry",generator:"Geometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.type,this.name!==""&&(e.name=this.name),this.parameters!==void 0){var t=this.parameters;for(var i in t)t[i]!==void 0&&(e[i]=t[i]);return e}for(var r=[],n=0;n<this.vertices.length;n++){var a=this.vertices[n];r.push(a.x,a.y,a.z)}for(var s=[],o=[],u={},l=[],f={},c=[],h={},n=0;n<this.faces.length;n++){var p=this.faces[n],v=!0,_=!1,M=this.faceVertexUvs[0][n]!==void 0,w=p.normal.length()>0,S=p.vertexNormals.length>0,L=p.color.r!==1||p.color.g!==1||p.color.b!==1,b=p.vertexColors.length>0,R=0;if(R=A(R,0,0),R=A(R,1,v),R=A(R,2,_),R=A(R,3,M),R=A(R,4,w),R=A(R,5,S),R=A(R,6,L),R=A(R,7,b),s.push(R),s.push(p.a,p.b,p.c),s.push(p.materialIndex),M){var P=this.faceVertexUvs[0][n];s.push(H(P[0]),H(P[1]),H(P[2]))}if(w&&s.push(F(p.normal)),S){var U=p.vertexNormals;s.push(F(U[0]),F(U[1]),F(U[2]))}if(L&&s.push(N(p.color)),b){var D=p.vertexColors;s.push(N(D[0]),N(D[1]),N(D[2]))}}function A(z,k,q){return q?z|1<<k:z&~(1<<k)}function F(z){var k=z.x.toString()+z.y.toString()+z.z.toString();return u[k]!==void 0||(u[k]=o.length/3,o.push(z.x,z.y,z.z)),u[k]}function N(z){var k=z.r.toString()+z.g.toString()+z.b.toString();return f[k]!==void 0||(f[k]=l.length,l.push(z.getHex())),f[k]}function H(z){var k=z.x.toString()+z.y.toString();return h[k]!==void 0||(h[k]=c.length/2,c.push(z.x,z.y)),h[k]}return e.data={},e.data.vertices=r,e.data.normals=o,l.length>0&&(e.data.colors=l),c.length>0&&(e.data.uvs=[c]),e.data.faces=s,e},clone:function(){return new lt().copy(this)},copy:function(e){var t,i,r,n,a,s;this.vertices=[],this.colors=[],this.faces=[],this.faceVertexUvs=[[]],this.morphTargets=[],this.morphNormals=[],this.skinWeights=[],this.skinIndices=[],this.lineDistances=[],this.boundingBox=null,this.boundingSphere=null,this.name=e.name;var o=e.vertices;for(t=0,i=o.length;t<i;t++)this.vertices.push(o[t].clone());var u=e.colors;for(t=0,i=u.length;t<i;t++)this.colors.push(u[t].clone());var l=e.faces;for(t=0,i=l.length;t<i;t++)this.faces.push(l[t].clone());for(t=0,i=e.faceVertexUvs.length;t<i;t++){var f=e.faceVertexUvs[t];for(this.faceVertexUvs[t]===void 0&&(this.faceVertexUvs[t]=[]),r=0,n=f.length;r<n;r++){var c=f[r],h=[];for(a=0,s=c.length;a<s;a++){var p=c[a];h.push(p.clone())}this.faceVertexUvs[t].push(h)}}var v=e.morphTargets;for(t=0,i=v.length;t<i;t++){var _={};if(_.name=v[t].name,v[t].vertices!==void 0)for(_.vertices=[],r=0,n=v[t].vertices.length;r<n;r++)_.vertices.push(v[t].vertices[r].clone());if(v[t].normals!==void 0)for(_.normals=[],r=0,n=v[t].normals.length;r<n;r++)_.normals.push(v[t].normals[r].clone());this.morphTargets.push(_)}var M=e.morphNormals;for(t=0,i=M.length;t<i;t++){var w={};if(M[t].vertexNormals!==void 0)for(w.vertexNormals=[],r=0,n=M[t].vertexNormals.length;r<n;r++){var S=M[t].vertexNormals[r],L={};L.a=S.a.clone(),L.b=S.b.clone(),L.c=S.c.clone(),w.vertexNormals.push(L)}if(M[t].faceNormals!==void 0)for(w.faceNormals=[],r=0,n=M[t].faceNormals.length;r<n;r++)w.faceNormals.push(M[t].faceNormals[r].clone());this.morphNormals.push(w)}var b=e.skinWeights;for(t=0,i=b.length;t<i;t++)this.skinWeights.push(b[t].clone());var R=e.skinIndices;for(t=0,i=R.length;t<i;t++)this.skinIndices.push(R[t].clone());var P=e.lineDistances;for(t=0,i=P.length;t<i;t++)this.lineDistances.push(P[t]);var U=e.boundingBox;U!==null&&(this.boundingBox=U.clone());var D=e.boundingSphere;return D!==null&&(this.boundingSphere=D.clone()),this.elementsNeedUpdate=e.elementsNeedUpdate,this.verticesNeedUpdate=e.verticesNeedUpdate,this.uvsNeedUpdate=e.uvsNeedUpdate,this.normalsNeedUpdate=e.normalsNeedUpdate,this.colorsNeedUpdate=e.colorsNeedUpdate,this.lineDistancesNeedUpdate=e.lineDistancesNeedUpdate,this.groupsNeedUpdate=e.groupsNeedUpdate,this},dispose:function(){this.dispatchEvent({type:"dispose"})}});function Mi(e,t,i,r){lt.call(this),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:i,heightSegments:r},this.fromBufferGeometry(new Et(e,t,i,r)),this.mergeVertices()}Mi.prototype=Object.create(lt.prototype);Mi.prototype.constructor=Mi;function Et(e,t,i,r){Ke.call(this),this.type="PlaneBufferGeometry",this.parameters={width:e,height:t,widthSegments:i,heightSegments:r},e=e||1,t=t||1;var n=e/2,a=t/2,s=Math.floor(i)||1,o=Math.floor(r)||1,u=s+1,l=o+1,f=e/s,c=t/o,h,p,v=[],_=[],M=[],w=[];for(p=0;p<l;p++){var S=p*c-a;for(h=0;h<u;h++){var L=h*f-n;_.push(L,-S,0),M.push(0,0,1),w.push(h/s),w.push(1-p/o)}}for(p=0;p<o;p++)for(h=0;h<s;h++){var b=h+u*p,R=h+u*(p+1),P=h+1+u*(p+1),U=h+1+u*p;v.push(b,R,U),v.push(R,P,U)}this.setIndex(v),this.addAttribute("position",new Oe(_,3)),this.addAttribute("normal",new Oe(M,3)),this.addAttribute("uv",new Oe(w,2))}Et.prototype=Object.create(Ke.prototype);Et.prototype.constructor=Et;function Ei(){we.call(this),this.type="Scene",this.background=null,this.fog=null,this.overrideMaterial=null,this.autoUpdate=!0}Ei.prototype=Object.assign(Object.create(we.prototype),{constructor:Ei,copy:function(e,t){return we.prototype.copy.call(this,e,t),e.background!==null&&(this.background=e.background.clone()),e.fog!==null&&(this.fog=e.fog.clone()),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.autoUpdate=e.autoUpdate,this.matrixAutoUpdate=e.matrixAutoUpdate,this},toJSON:function(e){var t=we.prototype.toJSON.call(this,e);return this.background!==null&&(t.object.background=this.background.toJSON(e)),this.fog!==null&&(t.object.fog=this.fog.toJSON()),t},dispose:function(){this.dispatchEvent({type:"dispose"})}});function Ut(e){var t={};for(var i in e){t[i]={};for(var r in e[i]){var n=e[i][r];n&&(n.isColor||n.isMatrix3||n.isMatrix4||n.isVector2||n.isVector3||n.isVector4||n.isTexture)?t[i][r]=n.clone():Array.isArray(n)?t[i][r]=n.slice():t[i][r]=n}}return t}function ke(e){for(var t={},i=0;i<e.length;i++){var r=Ut(e[i]);for(var n in r)t[n]=r[n]}return t}function nt(e){ze.call(this),this.type="ShaderMaterial",this.defines={},this.uniforms={},this.vertexShader=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,this.fragmentShader=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.skinning=!1,this.morphTargets=!1,this.morphNormals=!1,this.extensions={derivatives:!1,fragDepth:!1,drawBuffers:!1,shaderTextureLOD:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv2:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,e!==void 0&&(e.attributes!==void 0&&console.error("THREE.ShaderMaterial: attributes should now be defined in THREE.BufferGeometry instead."),this.setValues(e))}nt.prototype=Object.create(ze.prototype);nt.prototype.constructor=nt;nt.prototype.isShaderMaterial=!0;nt.prototype.copy=function(e){return ze.prototype.copy.call(this,e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=Ut(e.uniforms),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.lights=e.lights,this.clipping=e.clipping,this.skinning=e.skinning,this.morphTargets=e.morphTargets,this.morphNormals=e.morphNormals,this.extensions=e.extensions,this};nt.prototype.toJSON=function(e){var t=ze.prototype.toJSON.call(this,e);t.uniforms={};for(var i in this.uniforms){var r=this.uniforms[i],n=r.value;n&&n.isTexture?t.uniforms[i]={type:"t",value:n.toJSON(e).uuid}:n&&n.isColor?t.uniforms[i]={type:"c",value:n.getHex()}:n&&n.isVector2?t.uniforms[i]={type:"v2",value:n.toArray()}:n&&n.isVector3?t.uniforms[i]={type:"v3",value:n.toArray()}:n&&n.isVector4?t.uniforms[i]={type:"v4",value:n.toArray()}:n&&n.isMatrix3?t.uniforms[i]={type:"m3",value:n.toArray()}:n&&n.isMatrix4?t.uniforms[i]={type:"m4",value:n.toArray()}:t.uniforms[i]={value:n}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader;var a={};for(var s in this.extensions)this.extensions[s]===!0&&(a[s]=!0);return Object.keys(a).length>0&&(t.extensions=a),t};function jt(e,t,i){this.width=e,this.height=t,this.scissor=new Me(0,0,e,t),this.scissorTest=!1,this.viewport=new Me(0,0,e,t),i=i||{},this.texture=new Ue(void 0,void 0,i.wrapS,i.wrapT,i.magFilter,i.minFilter,i.format,i.type,i.anisotropy,i.encoding),this.texture.generateMipmaps=i.generateMipmaps!==void 0?i.generateMipmaps:!1,this.texture.minFilter=i.minFilter!==void 0?i.minFilter:pt,this.depthBuffer=i.depthBuffer!==void 0?i.depthBuffer:!0,this.stencilBuffer=i.stencilBuffer!==void 0?i.stencilBuffer:!0,this.depthTexture=i.depthTexture!==void 0?i.depthTexture:null}jt.prototype=Object.assign(Object.create(vt.prototype),{constructor:jt,isWebGLRenderTarget:!0,setSize:function(e,t){(this.width!==e||this.height!==t)&&(this.width=e,this.height=t,this.dispose()),this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)},clone:function(){return new this.constructor().copy(this)},copy:function(e){return this.width=e.width,this.height=e.height,this.viewport.copy(e.viewport),this.texture=e.texture.clone(),this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.depthTexture=e.depthTexture,this},dispose:function(){this.dispatchEvent({type:"dispose"})}});function It(e,t,i,r,n,a,s,o,u,l,f,c){Ue.call(this,null,a,s,o,u,l,r,n,f,c),this.image={data:e,width:t,height:i},this.magFilter=u!==void 0?u:Ge,this.minFilter=l!==void 0?l:Ge,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}It.prototype=Object.create(Ue.prototype);It.prototype.constructor=It;It.prototype.isDataTexture=!0;function ot(e,t){this.normal=e!==void 0?e:new T(1,0,0),this.constant=t!==void 0?t:0}Object.assign(ot.prototype,{set:function(e,t){return this.normal.copy(e),this.constant=t,this},setComponents:function(e,t,i,r){return this.normal.set(e,t,i),this.constant=r,this},setFromNormalAndCoplanarPoint:function(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this},setFromCoplanarPoints:function(){var e=new T,t=new T;return function(r,n,a){var s=e.subVectors(a,n).cross(t.subVectors(r,n)).normalize();return this.setFromNormalAndCoplanarPoint(s,r),this}}(),clone:function(){return new this.constructor().copy(this)},copy:function(e){return this.normal.copy(e.normal),this.constant=e.constant,this},normalize:function(){var e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this},negate:function(){return this.constant*=-1,this.normal.negate(),this},distanceToPoint:function(e){return this.normal.dot(e)+this.constant},distanceToSphere:function(e){return this.distanceToPoint(e.center)-e.radius},projectPoint:function(e,t){return t===void 0&&(console.warn("THREE.Plane: .projectPoint() target is now required"),t=new T),t.copy(this.normal).multiplyScalar(-this.distanceToPoint(e)).add(e)},intersectLine:function(){var e=new T;return function(i,r){r===void 0&&(console.warn("THREE.Plane: .intersectLine() target is now required"),r=new T);var n=i.delta(e),a=this.normal.dot(n);if(a===0)return this.distanceToPoint(i.start)===0?r.copy(i.start):void 0;var s=-(i.start.dot(this.normal)+this.constant)/a;if(!(s<0||s>1))return r.copy(n).multiplyScalar(s).add(i.start)}}(),intersectsLine:function(e){var t=this.distanceToPoint(e.start),i=this.distanceToPoint(e.end);return t<0&&i>0||i<0&&t>0},intersectsBox:function(e){return e.intersectsPlane(this)},intersectsSphere:function(e){return e.intersectsPlane(this)},coplanarPoint:function(e){return e===void 0&&(console.warn("THREE.Plane: .coplanarPoint() target is now required"),e=new T),e.copy(this.normal).multiplyScalar(-this.constant)},applyMatrix4:function(){var e=new T,t=new je;return function(r,n){var a=n||t.getNormalMatrix(r),s=this.coplanarPoint(e).applyMatrix4(r),o=this.normal.applyMatrix3(a).normalize();return this.constant=-s.dot(o),this}}(),translate:function(e){return this.constant-=e.dot(this.normal),this},equals:function(e){return e.normal.equals(this.normal)&&e.constant===this.constant}});function Ti(e,t,i,r,n,a){this.planes=[e!==void 0?e:new ot,t!==void 0?t:new ot,i!==void 0?i:new ot,r!==void 0?r:new ot,n!==void 0?n:new ot,a!==void 0?a:new ot]}Object.assign(Ti.prototype,{set:function(e,t,i,r,n,a){var s=this.planes;return s[0].copy(e),s[1].copy(t),s[2].copy(i),s[3].copy(r),s[4].copy(n),s[5].copy(a),this},clone:function(){return new this.constructor().copy(this)},copy:function(e){for(var t=this.planes,i=0;i<6;i++)t[i].copy(e.planes[i]);return this},setFromMatrix:function(e){var t=this.planes,i=e.elements,r=i[0],n=i[1],a=i[2],s=i[3],o=i[4],u=i[5],l=i[6],f=i[7],c=i[8],h=i[9],p=i[10],v=i[11],_=i[12],M=i[13],w=i[14],S=i[15];return t[0].setComponents(s-r,f-o,v-c,S-_).normalize(),t[1].setComponents(s+r,f+o,v+c,S+_).normalize(),t[2].setComponents(s+n,f+u,v+h,S+M).normalize(),t[3].setComponents(s-n,f-u,v-h,S-M).normalize(),t[4].setComponents(s-a,f-l,v-p,S-w).normalize(),t[5].setComponents(s+a,f+l,v+p,S+w).normalize(),this},intersectsObject:function(){var e=new mt;return function(i){var r=i.geometry;return r.boundingSphere===null&&r.computeBoundingSphere(),e.copy(r.boundingSphere).applyMatrix4(i.matrixWorld),this.intersectsSphere(e)}}(),intersectsSprite:function(){var e=new mt;return function(i){return e.center.set(0,0,0),e.radius=.7071067811865476,e.applyMatrix4(i.matrixWorld),this.intersectsSphere(e)}}(),intersectsSphere:function(e){for(var t=this.planes,i=e.center,r=-e.radius,n=0;n<6;n++){var a=t[n].distanceToPoint(i);if(a<r)return!1}return!0},intersectsBox:function(){var e=new T;return function(i){for(var r=this.planes,n=0;n<6;n++){var a=r[n];if(e.x=a.normal.x>0?i.max.x:i.min.x,e.y=a.normal.y>0?i.max.y:i.min.y,e.z=a.normal.z>0?i.max.z:i.min.z,a.distanceToPoint(e)<0)return!1}return!0}}(),containsPoint:function(e){for(var t=this.planes,i=0;i<6;i++)if(t[i].distanceToPoint(e)<0)return!1;return!0}});const _a=`
#ifdef USE_ALPHAMAP

	diffuseColor.a *= texture2D( alphaMap, vUv ).g;

#endif
`,xa=`
#ifdef USE_ALPHAMAP

	uniform sampler2D alphaMap;

#endif
`,ya=`
#ifdef ALPHATEST

	if ( diffuseColor.a < ALPHATEST ) discard;

#endif
`,Ma=`
#ifdef USE_AOMAP

	// reads channel R, compatible with a combined OcclusionRoughnessMetallic (RGB) texture
	float ambientOcclusion = ( texture2D( aoMap, vUv2 ).r - 1.0 ) * aoMapIntensity + 1.0;

	reflectedLight.indirectDiffuse *= ambientOcclusion;

	#if defined( USE_ENVMAP ) && defined( PHYSICAL )

		float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );

		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.specularRoughness );

	#endif

#endif
`,Ea=`
#ifdef USE_AOMAP

	uniform sampler2D aoMap;
	uniform float aoMapIntensity;

#endif
`,wa=`
vec3 transformed = vec3( position );
`,ba=`
vec3 objectNormal = vec3( normal );
`,Sa=`
float punctualLightIntensityToIrradianceFactor( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {

#if defined ( PHYSICALLY_CORRECT_LIGHTS )

	// based upon Frostbite 3 Moving to Physically-based Rendering
	// page 32, equation 26: E[window1]
	// https://seblagarde.files.wordpress.com/2015/07/course_notes_moving_frostbite_to_pbr_v32.pdf
	// this is intended to be used on spot and point lights who are represented as luminous intensity
	// but who must be converted to luminous irradiance for surface lighting calculation
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );

	if( cutoffDistance > 0.0 ) {

		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );

	}

	return distanceFalloff;

#else

	if( cutoffDistance > 0.0 && decayExponent > 0.0 ) {

		return pow( saturate( -lightDistance / cutoffDistance + 1.0 ), decayExponent );

	}

	return 1.0;

#endif

}

vec3 BRDF_Diffuse_Lambert( const in vec3 diffuseColor ) {

	return RECIPROCAL_PI * diffuseColor;

} // validated

vec3 F_Schlick( const in vec3 specularColor, const in float dotLH ) {

	// Original approximation by Christophe Schlick '94
	// float fresnel = pow( 1.0 - dotLH, 5.0 );

	// Optimized variant (presented by Epic at SIGGRAPH '13)
	// https://cdn2.unrealengine.com/Resources/files/2013SiggraphPresentationsNotes-26915738.pdf
	float fresnel = exp2( ( -5.55473 * dotLH - 6.98316 ) * dotLH );

	return ( 1.0 - specularColor ) * fresnel + specularColor;

} // validated

// Microfacet Models for Refraction through Rough Surfaces - equation (34)
// http://graphicrants.blogspot.com/2013/08/specular-brdf-reference.html
// alpha is "roughness squared" in Disney’s reparameterization
float G_GGX_Smith( const in float alpha, const in float dotNL, const in float dotNV ) {

	// geometry term (normalized) = G(l)⋅G(v) / 4(n⋅l)(n⋅v)
	// also see #12151

	float a2 = pow2( alpha );

	float gl = dotNL + sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	float gv = dotNV + sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );

	return 1.0 / ( gl * gv );

} // validated

// Moving Frostbite to Physically Based Rendering 3.0 - page 12, listing 2
// https://seblagarde.files.wordpress.com/2015/07/course_notes_moving_frostbite_to_pbr_v32.pdf
float G_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {

	float a2 = pow2( alpha );

	// dotNL and dotNV are explicitly swapped. This is not a mistake.
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );

	return 0.5 / max( gv + gl, EPSILON );

}

// Microfacet Models for Refraction through Rough Surfaces - equation (33)
// http://graphicrants.blogspot.com/2013/08/specular-brdf-reference.html
// alpha is "roughness squared" in Disney’s reparameterization
float D_GGX( const in float alpha, const in float dotNH ) {

	float a2 = pow2( alpha );

	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0; // avoid alpha = 0 with dotNH = 1

	return RECIPROCAL_PI * a2 / pow2( denom );

}

// GGX Distribution, Schlick Fresnel, GGX-Smith Visibility
vec3 BRDF_Specular_GGX( const in IncidentLight incidentLight, const in GeometricContext geometry, const in vec3 specularColor, const in float roughness ) {

	float alpha = pow2( roughness ); // UE4's roughness

	vec3 halfDir = normalize( incidentLight.direction + geometry.viewDir );

	float dotNL = saturate( dot( geometry.normal, incidentLight.direction ) );
	float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );
	float dotNH = saturate( dot( geometry.normal, halfDir ) );
	float dotLH = saturate( dot( incidentLight.direction, halfDir ) );

	vec3 F = F_Schlick( specularColor, dotLH );

	float G = G_GGX_SmithCorrelated( alpha, dotNL, dotNV );

	float D = D_GGX( alpha, dotNH );

	return F * ( G * D );

} // validated

// Rect Area Light

// Real-Time Polygonal-Light Shading with Linearly Transformed Cosines
// by Eric Heitz, Jonathan Dupuy, Stephen Hill and David Neubelt
// code: https://github.com/selfshadow/ltc_code/

vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {

	const float LUT_SIZE  = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS  = 0.5 / LUT_SIZE;

	float dotNV = saturate( dot( N, V ) );

	// texture parameterized by sqrt( GGX alpha ) and sqrt( 1 - cos( theta ) )
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );

	uv = uv * LUT_SCALE + LUT_BIAS;

	return uv;

}

float LTC_ClippedSphereFormFactor( const in vec3 f ) {

	// Real-Time Area Lighting: a Journey from Research to Production (p.102)
	// An approximation of the form factor of a horizon-clipped rectangle.

	float l = length( f );

	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );

}

vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {

	float x = dot( v1, v2 );

	float y = abs( x );

	// rational polynomial approximation to theta / sin( theta ) / 2PI
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;

	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;

	return cross( v1, v2 ) * theta_sintheta;

}

vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {

	// bail if point is on back side of plane of light
	// assumes ccw winding order of light vertices
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );

	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );

	// construct orthonormal basis around N
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 ); // negated from paper; possibly due to a different handedness of world coordinate system

	// compute transform
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );

	// transform rect
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );

	// project rect onto sphere
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );

	// calculate vector form factor
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );

	// adjust for horizon clipping
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );

/*
	// alternate method of adjusting for horizon clipping (see referece)
	// refactoring required
	float len = length( vectorFormFactor );
	float z = vectorFormFactor.z / len;

	const float LUT_SIZE  = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS  = 0.5 / LUT_SIZE;

	// tabulated horizon-clipped sphere, apparently...
	vec2 uv = vec2( z * 0.5 + 0.5, len );
	uv = uv * LUT_SCALE + LUT_BIAS;

	float scale = texture2D( ltc_2, uv ).w;

	float result = len * scale;
*/

	return vec3( result );

}

// End Rect Area Light

// ref: https://www.unrealengine.com/blog/physically-based-shading-on-mobile - environmentBRDF for GGX on mobile
vec3 BRDF_Specular_GGX_Environment( const in GeometricContext geometry, const in vec3 specularColor, const in float roughness ) {

	float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );

	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );

	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );

	vec4 r = roughness * c0 + c1;

	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;

	vec2 AB = vec2( -1.04, 1.04 ) * a004 + r.zw;

	return specularColor * AB.x + AB.y;

} // validated


float G_BlinnPhong_Implicit( /* const in float dotNL, const in float dotNV */ ) {

	// geometry term is (n dot l)(n dot v) / 4(n dot l)(n dot v)
	return 0.25;

}

float D_BlinnPhong( const in float shininess, const in float dotNH ) {

	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );

}

vec3 BRDF_Specular_BlinnPhong( const in IncidentLight incidentLight, const in GeometricContext geometry, const in vec3 specularColor, const in float shininess ) {

	vec3 halfDir = normalize( incidentLight.direction + geometry.viewDir );

	//float dotNL = saturate( dot( geometry.normal, incidentLight.direction ) );
	//float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );
	float dotNH = saturate( dot( geometry.normal, halfDir ) );
	float dotLH = saturate( dot( incidentLight.direction, halfDir ) );

	vec3 F = F_Schlick( specularColor, dotLH );

	float G = G_BlinnPhong_Implicit( /* dotNL, dotNV */ );

	float D = D_BlinnPhong( shininess, dotNH );

	return F * ( G * D );

} // validated

// source: http://simonstechblog.blogspot.ca/2011/12/microfacet-brdf.html
float GGXRoughnessToBlinnExponent( const in float ggxRoughness ) {
	return ( 2.0 / pow2( ggxRoughness + 0.0001 ) - 2.0 );
}

float BlinnExponentToGGXRoughness( const in float blinnExponent ) {
	return sqrt( 2.0 / ( blinnExponent + 2.0 ) );
}
`,Ta=`
#ifdef USE_BUMPMAP

	uniform sampler2D bumpMap;
	uniform float bumpScale;

	// Bump Mapping Unparametrized Surfaces on the GPU by Morten S. Mikkelsen
	// http://api.unrealengine.com/attachments/Engine/Rendering/LightingAndShadows/BumpMappingWithoutTangentSpace/mm_sfgrad_bump.pdf

	// Evaluate the derivative of the height w.r.t. screen-space using forward differencing (listing 2)

	vec2 dHdxy_fwd() {

		vec2 dSTdx = dFdx( vUv );
		vec2 dSTdy = dFdy( vUv );

		float Hll = bumpScale * texture2D( bumpMap, vUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vUv + dSTdy ).x - Hll;

		return vec2( dBx, dBy );

	}

	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy ) {

		// Workaround for Adreno 3XX dFd*( vec3 ) bug. See #9988

		vec3 vSigmaX = vec3( dFdx( surf_pos.x ), dFdx( surf_pos.y ), dFdx( surf_pos.z ) );
		vec3 vSigmaY = vec3( dFdy( surf_pos.x ), dFdy( surf_pos.y ), dFdy( surf_pos.z ) );
		vec3 vN = surf_norm;		// normalized

		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );

		float fDet = dot( vSigmaX, R1 );

		fDet *= ( float( gl_FrontFacing ) * 2.0 - 1.0 );

		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );

	}

#endif
`,La=`
#if NUM_CLIPPING_PLANES > 0

	vec4 plane;

	#pragma unroll_loop
	for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {

		plane = clippingPlanes[ i ];
		if ( dot( vViewPosition, plane.xyz ) > plane.w ) discard;

	}

	#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES

		bool clipped = true;

		#pragma unroll_loop
		for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {

			plane = clippingPlanes[ i ];
			clipped = ( dot( vViewPosition, plane.xyz ) > plane.w ) && clipped;

		}

		if ( clipped ) discard;

	#endif

#endif
`,Aa=`
#if NUM_CLIPPING_PLANES > 0

	#if ! defined( PHYSICAL ) && ! defined( PHONG ) && ! defined( MATCAP )
		varying vec3 vViewPosition;
	#endif

	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];

#endif
`,Ra=`
#if NUM_CLIPPING_PLANES > 0 && ! defined( PHYSICAL ) && ! defined( PHONG ) && ! defined( MATCAP )
	varying vec3 vViewPosition;
#endif
`,Pa=`
#if NUM_CLIPPING_PLANES > 0 && ! defined( PHYSICAL ) && ! defined( PHONG ) && ! defined( MATCAP )
	vViewPosition = - mvPosition.xyz;
#endif
`,Ca=`
#ifdef USE_COLOR

	diffuseColor.rgb *= vColor;

#endif
`,Da=`
#ifdef USE_COLOR

	varying vec3 vColor;

#endif
`,Fa=`
#ifdef USE_COLOR

	varying vec3 vColor;

#endif
`,Ua=`
#ifdef USE_COLOR

	vColor.xyz = color.xyz;

#endif
`,Ia=`
#define PI 3.14159265359
#define PI2 6.28318530718
#define PI_HALF 1.5707963267949
#define RECIPROCAL_PI 0.31830988618
#define RECIPROCAL_PI2 0.15915494
#define LOG2 1.442695
#define EPSILON 1e-6

#define saturate(a) clamp( a, 0.0, 1.0 )
#define whiteCompliment(a) ( 1.0 - saturate( a ) )

float pow2( const in float x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float average( const in vec3 color ) { return dot( color, vec3( 0.3333 ) ); }
// expects values in the range of [0,1]x[0,1], returns values in the [0,1] range.
// do not collapse into a single function per: http://byteblacksmith.com/improvements-to-the-canonical-one-liner-glsl-rand-for-opengl-es-2-0/
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract(sin(sn) * c);
}

struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};

struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};

struct GeometricContext {
	vec3 position;
	vec3 normal;
	vec3 viewDir;
};

vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

}

// http://en.wikibooks.org/wiki/GLSL_Programming/Applying_Matrix_Transformations
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {

	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );

}

vec3 projectOnPlane(in vec3 point, in vec3 pointOnPlane, in vec3 planeNormal ) {

	float distance = dot( planeNormal, point - pointOnPlane );

	return - distance * planeNormal + point;

}

float sideOfPlane( in vec3 point, in vec3 pointOnPlane, in vec3 planeNormal ) {

	return sign( dot( point - pointOnPlane, planeNormal ) );

}

vec3 linePlaneIntersect( in vec3 pointOnLine, in vec3 lineDirection, in vec3 pointOnPlane, in vec3 planeNormal ) {

	return lineDirection * ( dot( planeNormal, pointOnPlane - pointOnLine ) / dot( planeNormal, lineDirection ) ) + pointOnLine;

}

mat3 transposeMat3( const in mat3 m ) {

	mat3 tmp;

	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );

	return tmp;

}

// https://en.wikipedia.org/wiki/Relative_luminance
float linearToRelativeLuminance( const in vec3 color ) {

	vec3 weights = vec3( 0.2126, 0.7152, 0.0722 );

	return dot( weights, color.rgb );

}
`,Na=`
#ifdef ENVMAP_TYPE_CUBE_UV

#define cubeUV_textureSize (1024.0)

int getFaceFromDirection(vec3 direction) {
	vec3 absDirection = abs(direction);
	int face = -1;
	if( absDirection.x > absDirection.z ) {
		if(absDirection.x > absDirection.y )
			face = direction.x > 0.0 ? 0 : 3;
		else
			face = direction.y > 0.0 ? 1 : 4;
	}
	else {
		if(absDirection.z > absDirection.y )
			face = direction.z > 0.0 ? 2 : 5;
		else
			face = direction.y > 0.0 ? 1 : 4;
	}
	return face;
}
#define cubeUV_maxLods1  (log2(cubeUV_textureSize*0.25) - 1.0)
#define cubeUV_rangeClamp (exp2((6.0 - 1.0) * 2.0))

vec2 MipLevelInfo( vec3 vec, float roughnessLevel, float roughness ) {
	float scale = exp2(cubeUV_maxLods1 - roughnessLevel);
	float dxRoughness = dFdx(roughness);
	float dyRoughness = dFdy(roughness);
	vec3 dx = dFdx( vec * scale * dxRoughness );
	vec3 dy = dFdy( vec * scale * dyRoughness );
	float d = max( dot( dx, dx ), dot( dy, dy ) );
	// Clamp the value to the max mip level counts. hard coded to 6 mips
	d = clamp(d, 1.0, cubeUV_rangeClamp);
	float mipLevel = 0.5 * log2(d);
	return vec2(floor(mipLevel), fract(mipLevel));
}

#define cubeUV_maxLods2 (log2(cubeUV_textureSize*0.25) - 2.0)
#define cubeUV_rcpTextureSize (1.0 / cubeUV_textureSize)

vec2 getCubeUV(vec3 direction, float roughnessLevel, float mipLevel) {
	mipLevel = roughnessLevel > cubeUV_maxLods2 - 3.0 ? 0.0 : mipLevel;
	float a = 16.0 * cubeUV_rcpTextureSize;

	vec2 exp2_packed = exp2( vec2( roughnessLevel, mipLevel ) );
	vec2 rcp_exp2_packed = vec2( 1.0 ) / exp2_packed;
	// float powScale = exp2(roughnessLevel + mipLevel);
	float powScale = exp2_packed.x * exp2_packed.y;
	// float scale =  1.0 / exp2(roughnessLevel + 2.0 + mipLevel);
	float scale = rcp_exp2_packed.x * rcp_exp2_packed.y * 0.25;
	// float mipOffset = 0.75*(1.0 - 1.0/exp2(mipLevel))/exp2(roughnessLevel);
	float mipOffset = 0.75*(1.0 - rcp_exp2_packed.y) * rcp_exp2_packed.x;

	bool bRes = mipLevel == 0.0;
	scale =  bRes && (scale < a) ? a : scale;

	vec3 r;
	vec2 offset;
	int face = getFaceFromDirection(direction);

	float rcpPowScale = 1.0 / powScale;

	if( face == 0) {
		r = vec3(direction.x, -direction.z, direction.y);
		offset = vec2(0.0+mipOffset,0.75 * rcpPowScale);
		offset.y = bRes && (offset.y < 2.0*a) ? a : offset.y;
	}
	else if( face == 1) {
		r = vec3(direction.y, direction.x, direction.z);
		offset = vec2(scale+mipOffset, 0.75 * rcpPowScale);
		offset.y = bRes && (offset.y < 2.0*a) ? a : offset.y;
	}
	else if( face == 2) {
		r = vec3(direction.z, direction.x, direction.y);
		offset = vec2(2.0*scale+mipOffset, 0.75 * rcpPowScale);
		offset.y = bRes && (offset.y < 2.0*a) ? a : offset.y;
	}
	else if( face == 3) {
		r = vec3(direction.x, direction.z, direction.y);
		offset = vec2(0.0+mipOffset,0.5 * rcpPowScale);
		offset.y = bRes && (offset.y < 2.0*a) ? 0.0 : offset.y;
	}
	else if( face == 4) {
		r = vec3(direction.y, direction.x, -direction.z);
		offset = vec2(scale+mipOffset, 0.5 * rcpPowScale);
		offset.y = bRes && (offset.y < 2.0*a) ? 0.0 : offset.y;
	}
	else {
		r = vec3(direction.z, -direction.x, direction.y);
		offset = vec2(2.0*scale+mipOffset, 0.5 * rcpPowScale);
		offset.y = bRes && (offset.y < 2.0*a) ? 0.0 : offset.y;
	}
	r = normalize(r);
	float texelOffset = 0.5 * cubeUV_rcpTextureSize;
	vec2 s = ( r.yz / abs( r.x ) + vec2( 1.0 ) ) * 0.5;
	vec2 base = offset + vec2( texelOffset );
	return base + s * ( scale - 2.0 * texelOffset );
}

#define cubeUV_maxLods3 (log2(cubeUV_textureSize*0.25) - 3.0)

vec4 textureCubeUV( sampler2D envMap, vec3 reflectedDirection, float roughness ) {
	float roughnessVal = roughness* cubeUV_maxLods3;
	float r1 = floor(roughnessVal);
	float r2 = r1 + 1.0;
	float t = fract(roughnessVal);
	vec2 mipInfo = MipLevelInfo(reflectedDirection, r1, roughness);
	float s = mipInfo.y;
	float level0 = mipInfo.x;
	float level1 = level0 + 1.0;
	level1 = level1 > 5.0 ? 5.0 : level1;

	// round to nearest mipmap if we are not interpolating.
	level0 += min( floor( s + 0.5 ), 5.0 );

	// Tri linear interpolation.
	vec2 uv_10 = getCubeUV(reflectedDirection, r1, level0);
	vec4 color10 = envMapTexelToLinear(texture2D(envMap, uv_10));

	vec2 uv_20 = getCubeUV(reflectedDirection, r2, level0);
	vec4 color20 = envMapTexelToLinear(texture2D(envMap, uv_20));

	vec4 result = mix(color10, color20, t);

	return vec4(result.rgb, 1.0);
}

#endif
`,Ba=`
vec3 transformedNormal = normalMatrix * objectNormal;

#ifdef FLIP_SIDED

	transformedNormal = - transformedNormal;

#endif
`,Oa=`
#ifdef USE_DISPLACEMENTMAP

	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;

#endif
`,za=`
#ifdef USE_DISPLACEMENTMAP

	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, uv ).x * displacementScale + displacementBias );

#endif
`,Ga=`
#ifdef USE_EMISSIVEMAP

	vec4 emissiveColor = texture2D( emissiveMap, vUv );

	emissiveColor.rgb = emissiveMapTexelToLinear( emissiveColor ).rgb;

	totalEmissiveRadiance *= emissiveColor.rgb;

#endif
`,Va=`
#ifdef USE_EMISSIVEMAP

	uniform sampler2D emissiveMap;

#endif
`,Ha=`
  gl_FragColor = linearToOutputTexel( gl_FragColor );
`,ka=`
// For a discussion of what this is, please read this: http://lousodrome.net/blog/light/2013/05/26/gamma-correct-and-hdr-rendering-in-a-32-bits-buffer/

vec4 LinearToLinear( in vec4 value ) {
	return value;
}

vec4 GammaToLinear( in vec4 value, in float gammaFactor ) {
	return vec4( pow( value.rgb, vec3( gammaFactor ) ), value.a );
}

vec4 LinearToGamma( in vec4 value, in float gammaFactor ) {
	return vec4( pow( value.rgb, vec3( 1.0 / gammaFactor ) ), value.a );
}

vec4 sRGBToLinear( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}

vec4 LinearTosRGB( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}

vec4 RGBEToLinear( in vec4 value ) {
	return vec4( value.rgb * exp2( value.a * 255.0 - 128.0 ), 1.0 );
}

vec4 LinearToRGBE( in vec4 value ) {
	float maxComponent = max( max( value.r, value.g ), value.b );
	float fExp = clamp( ceil( log2( maxComponent ) ), -128.0, 127.0 );
	return vec4( value.rgb / exp2( fExp ), ( fExp + 128.0 ) / 255.0 );
//  return vec4( value.brg, ( 3.0 + 128.0 ) / 256.0 );
}

// reference: http://iwasbeingirony.blogspot.ca/2010/06/difference-between-rgbm-and-rgbd.html
vec4 RGBMToLinear( in vec4 value, in float maxRange ) {
	return vec4( value.rgb * value.a * maxRange, 1.0 );
}

vec4 LinearToRGBM( in vec4 value, in float maxRange ) {
	float maxRGB = max( value.r, max( value.g, value.b ) );
	float M = clamp( maxRGB / maxRange, 0.0, 1.0 );
	M = ceil( M * 255.0 ) / 255.0;
	return vec4( value.rgb / ( M * maxRange ), M );
}

// reference: http://iwasbeingirony.blogspot.ca/2010/06/difference-between-rgbm-and-rgbd.html
vec4 RGBDToLinear( in vec4 value, in float maxRange ) {
	return vec4( value.rgb * ( ( maxRange / 255.0 ) / value.a ), 1.0 );
}

vec4 LinearToRGBD( in vec4 value, in float maxRange ) {
	float maxRGB = max( value.r, max( value.g, value.b ) );
	float D = max( maxRange / maxRGB, 1.0 );
	D = min( floor( D ) / 255.0, 1.0 );
	return vec4( value.rgb * ( D * ( 255.0 / maxRange ) ), D );
}

// LogLuv reference: http://graphicrants.blogspot.ca/2009/04/rgbm-color-encoding.html

// M matrix, for encoding
const mat3 cLogLuvM = mat3( 0.2209, 0.3390, 0.4184, 0.1138, 0.6780, 0.7319, 0.0102, 0.1130, 0.2969 );
vec4 LinearToLogLuv( in vec4 value )  {
	vec3 Xp_Y_XYZp = value.rgb * cLogLuvM;
	Xp_Y_XYZp = max( Xp_Y_XYZp, vec3( 1e-6, 1e-6, 1e-6 ) );
	vec4 vResult;
	vResult.xy = Xp_Y_XYZp.xy / Xp_Y_XYZp.z;
	float Le = 2.0 * log2(Xp_Y_XYZp.y) + 127.0;
	vResult.w = fract( Le );
	vResult.z = ( Le - ( floor( vResult.w * 255.0 ) ) / 255.0 ) / 255.0;
	return vResult;
}

// Inverse M matrix, for decoding
const mat3 cLogLuvInverseM = mat3( 6.0014, -2.7008, -1.7996, -1.3320, 3.1029, -5.7721, 0.3008, -1.0882, 5.6268 );
vec4 LogLuvToLinear( in vec4 value ) {
	float Le = value.z * 255.0 + value.w;
	vec3 Xp_Y_XYZp;
	Xp_Y_XYZp.y = exp2( ( Le - 127.0 ) / 2.0 );
	Xp_Y_XYZp.z = Xp_Y_XYZp.y / value.y;
	Xp_Y_XYZp.x = value.x * Xp_Y_XYZp.z;
	vec3 vRGB = Xp_Y_XYZp.rgb * cLogLuvInverseM;
	return vec4( max( vRGB, 0.0 ), 1.0 );
}
`,Wa=`
#ifdef USE_ENVMAP

	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG )

		vec3 cameraToVertex = normalize( vWorldPosition - cameraPosition );

		// Transforming Normal Vectors with the Inverse Transformation
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );

		#ifdef ENVMAP_MODE_REFLECTION

			vec3 reflectVec = reflect( cameraToVertex, worldNormal );

		#else

			vec3 reflectVec = refract( cameraToVertex, worldNormal, refractionRatio );

		#endif

	#else

		vec3 reflectVec = vReflect;

	#endif

	#ifdef ENVMAP_TYPE_CUBE

		vec4 envColor = textureCube( envMap, vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );

	#elif defined( ENVMAP_TYPE_EQUIREC )

		vec2 sampleUV;

		reflectVec = normalize( reflectVec );

		sampleUV.y = asin( clamp( reflectVec.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;

		sampleUV.x = atan( reflectVec.z, reflectVec.x ) * RECIPROCAL_PI2 + 0.5;

		vec4 envColor = texture2D( envMap, sampleUV );

	#elif defined( ENVMAP_TYPE_SPHERE )

		reflectVec = normalize( reflectVec );

		vec3 reflectView = normalize( ( viewMatrix * vec4( reflectVec, 0.0 ) ).xyz + vec3( 0.0, 0.0, 1.0 ) );

		vec4 envColor = texture2D( envMap, reflectView.xy * 0.5 + 0.5 );

	#else

		vec4 envColor = vec4( 0.0 );

	#endif

	envColor = envMapTexelToLinear( envColor );

	#ifdef ENVMAP_BLENDING_MULTIPLY

		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );

	#elif defined( ENVMAP_BLENDING_MIX )

		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );

	#elif defined( ENVMAP_BLENDING_ADD )

		outgoingLight += envColor.xyz * specularStrength * reflectivity;

	#endif

#endif
`,Xa=`
#if defined( USE_ENVMAP ) || defined( PHYSICAL )
	uniform float reflectivity;
	uniform float envMapIntensity;
#endif

#ifdef USE_ENVMAP

	#if ! defined( PHYSICAL ) && ( defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) )
		varying vec3 vWorldPosition;
	#endif

	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	uniform float flipEnvMap;
	uniform int maxMipLevel;

	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( PHYSICAL )
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif

#endif
`,qa=`
#ifdef USE_ENVMAP

	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG )
		varying vec3 vWorldPosition;

	#else

		varying vec3 vReflect;
		uniform float refractionRatio;

	#endif

#endif
`,Ya=`
#ifdef USE_ENVMAP

	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG )

		vWorldPosition = worldPosition.xyz;

	#else

		vec3 cameraToVertex = normalize( worldPosition.xyz - cameraPosition );

		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );

		#ifdef ENVMAP_MODE_REFLECTION

			vReflect = reflect( cameraToVertex, worldNormal );

		#else

			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );

		#endif

	#endif

#endif
`,ja=`
#ifdef USE_FOG

	fogDepth = -mvPosition.z;

#endif
`,Za=`
#ifdef USE_FOG

	varying float fogDepth;

#endif
`,Ja=`
#ifdef USE_FOG

	#ifdef FOG_EXP2

		float fogFactor = whiteCompliment( exp2( - fogDensity * fogDensity * fogDepth * fogDepth * LOG2 ) );

	#else

		float fogFactor = smoothstep( fogNear, fogFar, fogDepth );

	#endif

	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );

#endif
`,Qa=`
#ifdef USE_FOG

	uniform vec3 fogColor;
	varying float fogDepth;

	#ifdef FOG_EXP2

		uniform float fogDensity;

	#else

		uniform float fogNear;
		uniform float fogFar;

	#endif

#endif
`,Ka=`
#ifdef TOON

	uniform sampler2D gradientMap;

	vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {

		// dotNL will be from -1.0 to 1.0
		float dotNL = dot( normal, lightDirection );
		vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );

		#ifdef USE_GRADIENTMAP

			return texture2D( gradientMap, coord ).rgb;

		#else

			return ( coord.x < 0.7 ) ? vec3( 0.7 ) : vec3( 1.0 );

		#endif


	}

#endif
`,$a=`
#ifdef USE_LIGHTMAP

	reflectedLight.indirectDiffuse += PI * texture2D( lightMap, vUv2 ).xyz * lightMapIntensity; // factor of PI should not be present; included here to prevent breakage

#endif
`,es=`
#ifdef USE_LIGHTMAP

	uniform sampler2D lightMap;
	uniform float lightMapIntensity;

#endif
`,ts=`
vec3 diffuse = vec3( 1.0 );

GeometricContext geometry;
geometry.position = mvPosition.xyz;
geometry.normal = normalize( transformedNormal );
geometry.viewDir = normalize( -mvPosition.xyz );

GeometricContext backGeometry;
backGeometry.position = geometry.position;
backGeometry.normal = -geometry.normal;
backGeometry.viewDir = geometry.viewDir;

vLightFront = vec3( 0.0 );

#ifdef DOUBLE_SIDED
	vLightBack = vec3( 0.0 );
#endif

IncidentLight directLight;
float dotNL;
vec3 directLightColor_Diffuse;

#if NUM_POINT_LIGHTS > 0

	#pragma unroll_loop
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {

		getPointDirectLightIrradiance( pointLights[ i ], geometry, directLight );

		dotNL = dot( geometry.normal, directLight.direction );
		directLightColor_Diffuse = PI * directLight.color;

		vLightFront += saturate( dotNL ) * directLightColor_Diffuse;

		#ifdef DOUBLE_SIDED

			vLightBack += saturate( -dotNL ) * directLightColor_Diffuse;

		#endif

	}

#endif

#if NUM_SPOT_LIGHTS > 0

	#pragma unroll_loop
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {

		getSpotDirectLightIrradiance( spotLights[ i ], geometry, directLight );

		dotNL = dot( geometry.normal, directLight.direction );
		directLightColor_Diffuse = PI * directLight.color;

		vLightFront += saturate( dotNL ) * directLightColor_Diffuse;

		#ifdef DOUBLE_SIDED

			vLightBack += saturate( -dotNL ) * directLightColor_Diffuse;

		#endif
	}

#endif

/*
#if NUM_RECT_AREA_LIGHTS > 0

	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {

		// TODO (abelnation): implement

	}

#endif
*/

#if NUM_DIR_LIGHTS > 0

	#pragma unroll_loop
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

		getDirectionalDirectLightIrradiance( directionalLights[ i ], geometry, directLight );

		dotNL = dot( geometry.normal, directLight.direction );
		directLightColor_Diffuse = PI * directLight.color;

		vLightFront += saturate( dotNL ) * directLightColor_Diffuse;

		#ifdef DOUBLE_SIDED

			vLightBack += saturate( -dotNL ) * directLightColor_Diffuse;

		#endif

	}

#endif

#if NUM_HEMI_LIGHTS > 0

	#pragma unroll_loop
	for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {

		vLightFront += getHemisphereLightIrradiance( hemisphereLights[ i ], geometry );

		#ifdef DOUBLE_SIDED

			vLightBack += getHemisphereLightIrradiance( hemisphereLights[ i ], backGeometry );

		#endif

	}

#endif
`,is=`
uniform vec3 ambientLightColor;

vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {

	vec3 irradiance = ambientLightColor;

	#ifndef PHYSICALLY_CORRECT_LIGHTS

		irradiance *= PI;

	#endif

	return irradiance;

}

#if NUM_DIR_LIGHTS > 0

	struct DirectionalLight {
		vec3 direction;
		vec3 color;

		int shadow;
		float shadowBias;
		float shadowRadius;
		vec2 shadowMapSize;
	};

	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];

	void getDirectionalDirectLightIrradiance( const in DirectionalLight directionalLight, const in GeometricContext geometry, out IncidentLight directLight ) {

		directLight.color = directionalLight.color;
		directLight.direction = directionalLight.direction;
		directLight.visible = true;

	}

#endif


#if NUM_POINT_LIGHTS > 0

	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;

		int shadow;
		float shadowBias;
		float shadowRadius;
		vec2 shadowMapSize;
		float shadowCameraNear;
		float shadowCameraFar;
	};

	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];

	// directLight is an out parameter as having it as a return value caused compiler errors on some devices
	void getPointDirectLightIrradiance( const in PointLight pointLight, const in GeometricContext geometry, out IncidentLight directLight ) {

		vec3 lVector = pointLight.position - geometry.position;
		directLight.direction = normalize( lVector );

		float lightDistance = length( lVector );

		directLight.color = pointLight.color;
		directLight.color *= punctualLightIntensityToIrradianceFactor( lightDistance, pointLight.distance, pointLight.decay );
		directLight.visible = ( directLight.color != vec3( 0.0 ) );

	}

#endif


#if NUM_SPOT_LIGHTS > 0

	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;

		int shadow;
		float shadowBias;
		float shadowRadius;
		vec2 shadowMapSize;
	};

	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];

	// directLight is an out parameter as having it as a return value caused compiler errors on some devices
	void getSpotDirectLightIrradiance( const in SpotLight spotLight, const in GeometricContext geometry, out IncidentLight directLight  ) {

		vec3 lVector = spotLight.position - geometry.position;
		directLight.direction = normalize( lVector );

		float lightDistance = length( lVector );
		float angleCos = dot( directLight.direction, spotLight.direction );

		if ( angleCos > spotLight.coneCos ) {

			float spotEffect = smoothstep( spotLight.coneCos, spotLight.penumbraCos, angleCos );

			directLight.color = spotLight.color;
			directLight.color *= spotEffect * punctualLightIntensityToIrradianceFactor( lightDistance, spotLight.distance, spotLight.decay );
			directLight.visible = true;

		} else {

			directLight.color = vec3( 0.0 );
			directLight.visible = false;

		}
	}

#endif


#if NUM_RECT_AREA_LIGHTS > 0

	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};

	// Pre-computed values of LinearTransformedCosine approximation of BRDF
	// BRDF approximation Texture is 64x64
	uniform sampler2D ltc_1; // RGBA Float
	uniform sampler2D ltc_2; // RGBA Float

	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];

#endif


#if NUM_HEMI_LIGHTS > 0

	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};

	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];

	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in GeometricContext geometry ) {

		float dotNL = dot( geometry.normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;

		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );

		#ifndef PHYSICALLY_CORRECT_LIGHTS

			irradiance *= PI;

		#endif

		return irradiance;

	}

#endif
`,rs=`
#if defined( USE_ENVMAP ) && defined( PHYSICAL )

	vec3 getLightProbeIndirectIrradiance( /*const in SpecularLightProbe specularLightProbe,*/ const in GeometricContext geometry, const in int maxMIPLevel ) {

		vec3 worldNormal = inverseTransformDirection( geometry.normal, viewMatrix );

		#ifdef ENVMAP_TYPE_CUBE

			vec3 queryVec = vec3( flipEnvMap * worldNormal.x, worldNormal.yz );

			// TODO: replace with properly filtered cubemaps and access the irradiance LOD level, be it the last LOD level
			// of a specular cubemap, or just the default level of a specially created irradiance cubemap.

			#ifdef TEXTURE_LOD_EXT

				vec4 envMapColor = textureCubeLodEXT( envMap, queryVec, float( maxMIPLevel ) );

			#else

				// force the bias high to get the last LOD level as it is the most blurred.
				vec4 envMapColor = textureCube( envMap, queryVec, float( maxMIPLevel ) );

			#endif

			envMapColor.rgb = envMapTexelToLinear( envMapColor ).rgb;

		#elif defined( ENVMAP_TYPE_CUBE_UV )

			vec3 queryVec = vec3( flipEnvMap * worldNormal.x, worldNormal.yz );
			vec4 envMapColor = textureCubeUV( envMap, queryVec, 1.0 );

		#else

			vec4 envMapColor = vec4( 0.0 );

		#endif

		return PI * envMapColor.rgb * envMapIntensity;

	}

	// taken from here: http://casual-effects.blogspot.ca/2011/08/plausible-environment-lighting-in-two.html
	float getSpecularMIPLevel( const in float blinnShininessExponent, const in int maxMIPLevel ) {

		//float envMapWidth = pow( 2.0, maxMIPLevelScalar );
		//float desiredMIPLevel = log2( envMapWidth * sqrt( 3.0 ) ) - 0.5 * log2( pow2( blinnShininessExponent ) + 1.0 );

		float maxMIPLevelScalar = float( maxMIPLevel );
		float desiredMIPLevel = maxMIPLevelScalar + 0.79248 - 0.5 * log2( pow2( blinnShininessExponent ) + 1.0 );

		// clamp to allowable LOD ranges.
		return clamp( desiredMIPLevel, 0.0, maxMIPLevelScalar );

	}

	vec3 getLightProbeIndirectRadiance( /*const in SpecularLightProbe specularLightProbe,*/ const in GeometricContext geometry, const in float blinnShininessExponent, const in int maxMIPLevel ) {

		#ifdef ENVMAP_MODE_REFLECTION

			vec3 reflectVec = reflect( -geometry.viewDir, geometry.normal );

		#else

			vec3 reflectVec = refract( -geometry.viewDir, geometry.normal, refractionRatio );

		#endif

		reflectVec = inverseTransformDirection( reflectVec, viewMatrix );

		float specularMIPLevel = getSpecularMIPLevel( blinnShininessExponent, maxMIPLevel );

		#ifdef ENVMAP_TYPE_CUBE

			vec3 queryReflectVec = vec3( flipEnvMap * reflectVec.x, reflectVec.yz );

			#ifdef TEXTURE_LOD_EXT

				vec4 envMapColor = textureCubeLodEXT( envMap, queryReflectVec, specularMIPLevel );

			#else

				vec4 envMapColor = textureCube( envMap, queryReflectVec, specularMIPLevel );

			#endif

			envMapColor.rgb = envMapTexelToLinear( envMapColor ).rgb;

		#elif defined( ENVMAP_TYPE_CUBE_UV )

			vec3 queryReflectVec = vec3( flipEnvMap * reflectVec.x, reflectVec.yz );
			vec4 envMapColor = textureCubeUV( envMap, queryReflectVec, BlinnExponentToGGXRoughness(blinnShininessExponent ));

		#elif defined( ENVMAP_TYPE_EQUIREC )

			vec2 sampleUV;
			sampleUV.y = asin( clamp( reflectVec.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
			sampleUV.x = atan( reflectVec.z, reflectVec.x ) * RECIPROCAL_PI2 + 0.5;

			#ifdef TEXTURE_LOD_EXT

				vec4 envMapColor = texture2DLodEXT( envMap, sampleUV, specularMIPLevel );

			#else

				vec4 envMapColor = texture2D( envMap, sampleUV, specularMIPLevel );

			#endif

			envMapColor.rgb = envMapTexelToLinear( envMapColor ).rgb;

		#elif defined( ENVMAP_TYPE_SPHERE )

			vec3 reflectView = normalize( ( viewMatrix * vec4( reflectVec, 0.0 ) ).xyz + vec3( 0.0,0.0,1.0 ) );

			#ifdef TEXTURE_LOD_EXT

				vec4 envMapColor = texture2DLodEXT( envMap, reflectView.xy * 0.5 + 0.5, specularMIPLevel );

			#else

				vec4 envMapColor = texture2D( envMap, reflectView.xy * 0.5 + 0.5, specularMIPLevel );

			#endif

			envMapColor.rgb = envMapTexelToLinear( envMapColor ).rgb;

		#endif

		return envMapColor.rgb * envMapIntensity;

	}

#endif
`,ns=`
BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;
`,as=`
varying vec3 vViewPosition;

#ifndef FLAT_SHADED

	varying vec3 vNormal;

#endif


struct BlinnPhongMaterial {

	vec3	diffuseColor;
	vec3	specularColor;
	float	specularShininess;
	float	specularStrength;

};

void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in GeometricContext geometry, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {

	#ifdef TOON

		vec3 irradiance = getGradientIrradiance( geometry.normal, directLight.direction ) * directLight.color;

	#else

		float dotNL = saturate( dot( geometry.normal, directLight.direction ) );
		vec3 irradiance = dotNL * directLight.color;

	#endif

	#ifndef PHYSICALLY_CORRECT_LIGHTS

		irradiance *= PI; // punctual light

	#endif

	reflectedLight.directDiffuse += irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );

	reflectedLight.directSpecular += irradiance * BRDF_Specular_BlinnPhong( directLight, geometry, material.specularColor, material.specularShininess ) * material.specularStrength;

}

void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in GeometricContext geometry, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {

	reflectedLight.indirectDiffuse += irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );

}

#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong

#define Material_LightProbeLOD( material )	(0)
`,ss=`
PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.specularRoughness = clamp( roughnessFactor, 0.04, 1.0 );
#ifdef STANDARD
	material.specularColor = mix( vec3( DEFAULT_SPECULAR_COEFFICIENT ), diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( MAXIMUM_SPECULAR_COEFFICIENT * pow2( reflectivity ) ), diffuseColor.rgb, metalnessFactor );
	material.clearCoat = saturate( clearCoat ); // Burley clearcoat model
	material.clearCoatRoughness = clamp( clearCoatRoughness, 0.04, 1.0 );
#endif
`,os=`
struct PhysicalMaterial {

	vec3	diffuseColor;
	float	specularRoughness;
	vec3	specularColor;

	#ifndef STANDARD
		float clearCoat;
		float clearCoatRoughness;
	#endif

};

#define MAXIMUM_SPECULAR_COEFFICIENT 0.16
#define DEFAULT_SPECULAR_COEFFICIENT 0.04

// Clear coat directional hemishperical reflectance (this approximation should be improved)
float clearCoatDHRApprox( const in float roughness, const in float dotNL ) {

	return DEFAULT_SPECULAR_COEFFICIENT + ( 1.0 - DEFAULT_SPECULAR_COEFFICIENT ) * ( pow( 1.0 - dotNL, 5.0 ) * pow( 1.0 - roughness, 2.0 ) );

}

#if NUM_RECT_AREA_LIGHTS > 0

	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {

		vec3 normal = geometry.normal;
		vec3 viewDir = geometry.viewDir;
		vec3 position = geometry.position;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.specularRoughness;

		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight; // counterclockwise; light shines in local neg z direction
		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;

		vec2 uv = LTC_Uv( normal, viewDir, roughness );

		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );

		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);

		// LTC Fresnel Approximation by Stephen Hill
		// http://blog.selfshadow.com/publications/s2016-advances/s2016_ltc_fresnel.pdf
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );

		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );

		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );

	}

#endif

void RE_Direct_Physical( const in IncidentLight directLight, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {

	float dotNL = saturate( dot( geometry.normal, directLight.direction ) );

	vec3 irradiance = dotNL * directLight.color;

	#ifndef PHYSICALLY_CORRECT_LIGHTS

		irradiance *= PI; // punctual light

	#endif

	#ifndef STANDARD
		float clearCoatDHR = material.clearCoat * clearCoatDHRApprox( material.clearCoatRoughness, dotNL );
	#else
		float clearCoatDHR = 0.0;
	#endif

	reflectedLight.directSpecular += ( 1.0 - clearCoatDHR ) * irradiance * BRDF_Specular_GGX( directLight, geometry, material.specularColor, material.specularRoughness );

	reflectedLight.directDiffuse += ( 1.0 - clearCoatDHR ) * irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );

	#ifndef STANDARD

		reflectedLight.directSpecular += irradiance * material.clearCoat * BRDF_Specular_GGX( directLight, geometry, vec3( DEFAULT_SPECULAR_COEFFICIENT ), material.clearCoatRoughness );

	#endif

}

void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {

	reflectedLight.indirectDiffuse += irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );

}

void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 clearCoatRadiance, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {

	#ifndef STANDARD
		float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );
		float dotNL = dotNV;
		float clearCoatDHR = material.clearCoat * clearCoatDHRApprox( material.clearCoatRoughness, dotNL );
	#else
		float clearCoatDHR = 0.0;
	#endif

	reflectedLight.indirectSpecular += ( 1.0 - clearCoatDHR ) * radiance * BRDF_Specular_GGX_Environment( geometry, material.specularColor, material.specularRoughness );

	#ifndef STANDARD

		reflectedLight.indirectSpecular += clearCoatRadiance * material.clearCoat * BRDF_Specular_GGX_Environment( geometry, vec3( DEFAULT_SPECULAR_COEFFICIENT ), material.clearCoatRoughness );

	#endif

}

#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical

#define Material_BlinnShininessExponent( material )   GGXRoughnessToBlinnExponent( material.specularRoughness )
#define Material_ClearCoat_BlinnShininessExponent( material )   GGXRoughnessToBlinnExponent( material.clearCoatRoughness )

// ref: https://seblagarde.files.wordpress.com/2015/07/course_notes_moving_frostbite_to_pbr_v32.pdf
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {

	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );

}
`,ls=`
/**
 * This is a template that can be used to light a material, it uses pluggable
 * RenderEquations (RE)for specific lighting scenarios.
 *
 * Instructions for use:
 * - Ensure that both RE_Direct, RE_IndirectDiffuse and RE_IndirectSpecular are defined
 * - If you have defined an RE_IndirectSpecular, you need to also provide a Material_LightProbeLOD. <---- ???
 * - Create a material parameter that is to be passed as the third parameter to your lighting functions.
 *
 * TODO:
 * - Add area light support.
 * - Add sphere light support.
 * - Add diffuse light probe (irradiance cubemap) support.
 */

GeometricContext geometry;

geometry.position = - vViewPosition;
geometry.normal = normal;
geometry.viewDir = normalize( vViewPosition );

IncidentLight directLight;

#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )

	PointLight pointLight;

	#pragma unroll_loop
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {

		pointLight = pointLights[ i ];

		getPointDirectLightIrradiance( pointLight, geometry, directLight );

		#ifdef USE_SHADOWMAP
		directLight.color *= all( bvec2( pointLight.shadow, directLight.visible ) ) ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
		#endif

		RE_Direct( directLight, geometry, material, reflectedLight );

	}

#endif

#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )

	SpotLight spotLight;

	#pragma unroll_loop
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {

		spotLight = spotLights[ i ];

		getSpotDirectLightIrradiance( spotLight, geometry, directLight );

		#ifdef USE_SHADOWMAP
		directLight.color *= all( bvec2( spotLight.shadow, directLight.visible ) ) ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowBias, spotLight.shadowRadius, vSpotShadowCoord[ i ] ) : 1.0;
		#endif

		RE_Direct( directLight, geometry, material, reflectedLight );

	}

#endif

#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )

	DirectionalLight directionalLight;

	#pragma unroll_loop
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

		directionalLight = directionalLights[ i ];

		getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );

		#ifdef USE_SHADOWMAP
		directLight.color *= all( bvec2( directionalLight.shadow, directLight.visible ) ) ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif

		RE_Direct( directLight, geometry, material, reflectedLight );

	}

#endif

#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )

	RectAreaLight rectAreaLight;

	#pragma unroll_loop
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {

		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometry, material, reflectedLight );

	}

#endif

#if defined( RE_IndirectDiffuse )

	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );

	#if ( NUM_HEMI_LIGHTS > 0 )

		#pragma unroll_loop
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {

			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometry );

		}

	#endif

#endif

#if defined( RE_IndirectSpecular )

	vec3 radiance = vec3( 0.0 );
	vec3 clearCoatRadiance = vec3( 0.0 );

#endif
`,us=`
#if defined( RE_IndirectDiffuse )

	#ifdef USE_LIGHTMAP

		vec3 lightMapIrradiance = texture2D( lightMap, vUv2 ).xyz * lightMapIntensity;

		#ifndef PHYSICALLY_CORRECT_LIGHTS

			lightMapIrradiance *= PI; // factor of PI should not be present; included here to prevent breakage

		#endif

		irradiance += lightMapIrradiance;

	#endif

	#if defined( USE_ENVMAP ) && defined( PHYSICAL ) && defined( ENVMAP_TYPE_CUBE_UV )

		irradiance += getLightProbeIndirectIrradiance( /*lightProbe,*/ geometry, maxMipLevel );

	#endif

#endif

#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )

	radiance += getLightProbeIndirectRadiance( /*specularLightProbe,*/ geometry, Material_BlinnShininessExponent( material ), maxMipLevel );

	#ifndef STANDARD
		clearCoatRadiance += getLightProbeIndirectRadiance( /*specularLightProbe,*/ geometry, Material_ClearCoat_BlinnShininessExponent( material ), maxMipLevel );
	#endif

#endif
`,fs=`
#if defined( RE_IndirectDiffuse )

	RE_IndirectDiffuse( irradiance, geometry, material, reflectedLight );

#endif

#if defined( RE_IndirectSpecular )

	RE_IndirectSpecular( radiance, clearCoatRadiance, geometry, material, reflectedLight );

#endif
`,cs=`
#if defined( USE_LOGDEPTHBUF ) && defined( USE_LOGDEPTHBUF_EXT )

	gl_FragDepthEXT = log2( vFragDepth ) * logDepthBufFC * 0.5;

#endif
`,hs=`
#if defined( USE_LOGDEPTHBUF ) && defined( USE_LOGDEPTHBUF_EXT )

	uniform float logDepthBufFC;
	varying float vFragDepth;

#endif
`,ds=`
#ifdef USE_LOGDEPTHBUF

	#ifdef USE_LOGDEPTHBUF_EXT

		varying float vFragDepth;

	#else

		uniform float logDepthBufFC;

	#endif

#endif
`,ps=`
#ifdef USE_LOGDEPTHBUF

	#ifdef USE_LOGDEPTHBUF_EXT

		vFragDepth = 1.0 + gl_Position.w;

	#else

		gl_Position.z = log2( max( EPSILON, gl_Position.w + 1.0 ) ) * logDepthBufFC - 1.0;

		gl_Position.z *= gl_Position.w;

	#endif

#endif
`,ms=`
#ifdef USE_MAP

	vec4 texelColor = texture2D( map, vUv );

	texelColor = mapTexelToLinear( texelColor );
	diffuseColor *= texelColor;

#endif
`,vs=`
#ifdef USE_MAP

	uniform sampler2D map;

#endif
`,gs=`
#ifdef USE_MAP

	vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	vec4 mapTexel = texture2D( map, uv );
	diffuseColor *= mapTexelToLinear( mapTexel );

#endif
`,_s=`
#ifdef USE_MAP

	uniform mat3 uvTransform;
	uniform sampler2D map;

#endif
`,xs=`
float metalnessFactor = metalness;

#ifdef USE_METALNESSMAP

	vec4 texelMetalness = texture2D( metalnessMap, vUv );

	// reads channel B, compatible with a combined OcclusionRoughnessMetallic (RGB) texture
	metalnessFactor *= texelMetalness.b;

#endif
`,ys=`
#ifdef USE_METALNESSMAP

	uniform sampler2D metalnessMap;

#endif
`,Ms=`
#ifdef USE_MORPHNORMALS

	objectNormal += ( morphNormal0 - normal ) * morphTargetInfluences[ 0 ];
	objectNormal += ( morphNormal1 - normal ) * morphTargetInfluences[ 1 ];
	objectNormal += ( morphNormal2 - normal ) * morphTargetInfluences[ 2 ];
	objectNormal += ( morphNormal3 - normal ) * morphTargetInfluences[ 3 ];

#endif
`,Es=`
#ifdef USE_MORPHTARGETS

	#ifndef USE_MORPHNORMALS

	uniform float morphTargetInfluences[ 8 ];

	#else

	uniform float morphTargetInfluences[ 4 ];

	#endif

#endif
`,ws=`
#ifdef USE_MORPHTARGETS

	transformed += ( morphTarget0 - position ) * morphTargetInfluences[ 0 ];
	transformed += ( morphTarget1 - position ) * morphTargetInfluences[ 1 ];
	transformed += ( morphTarget2 - position ) * morphTargetInfluences[ 2 ];
	transformed += ( morphTarget3 - position ) * morphTargetInfluences[ 3 ];

	#ifndef USE_MORPHNORMALS

	transformed += ( morphTarget4 - position ) * morphTargetInfluences[ 4 ];
	transformed += ( morphTarget5 - position ) * morphTargetInfluences[ 5 ];
	transformed += ( morphTarget6 - position ) * morphTargetInfluences[ 6 ];
	transformed += ( morphTarget7 - position ) * morphTargetInfluences[ 7 ];

	#endif

#endif
`,bs=`
#ifdef FLAT_SHADED

	// Workaround for Adreno/Nexus5 not able able to do dFdx( vViewPosition ) ...

	vec3 fdx = vec3( dFdx( vViewPosition.x ), dFdx( vViewPosition.y ), dFdx( vViewPosition.z ) );
	vec3 fdy = vec3( dFdy( vViewPosition.x ), dFdy( vViewPosition.y ), dFdy( vViewPosition.z ) );
	vec3 normal = normalize( cross( fdx, fdy ) );

#else

	vec3 normal = normalize( vNormal );

	#ifdef DOUBLE_SIDED

		normal = normal * ( float( gl_FrontFacing ) * 2.0 - 1.0 );

	#endif

#endif
`,Ss=`
#ifdef USE_NORMALMAP

	#ifdef OBJECTSPACE_NORMALMAP

		normal = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0; // overrides both flatShading and attribute normals

		#ifdef FLIP_SIDED

			normal = - normal;

		#endif

		#ifdef DOUBLE_SIDED

			normal = normal * ( float( gl_FrontFacing ) * 2.0 - 1.0 );

		#endif

		normal = normalize( normalMatrix * normal );

	#else // tangent-space normal map

		normal = perturbNormal2Arb( -vViewPosition, normal );

	#endif

#elif defined( USE_BUMPMAP )

	normal = perturbNormalArb( -vViewPosition, normal, dHdxy_fwd() );

#endif
`,Ts=`
#ifdef USE_NORMALMAP

	uniform sampler2D normalMap;
	uniform vec2 normalScale;

	#ifdef OBJECTSPACE_NORMALMAP

		uniform mat3 normalMatrix;

	#else

		// Per-Pixel Tangent Space Normal Mapping
		// http://hacksoflife.blogspot.ch/2009/11/per-pixel-tangent-space-normal-mapping.html

		vec3 perturbNormal2Arb( vec3 eye_pos, vec3 surf_norm ) {

			// Workaround for Adreno 3XX dFd*( vec3 ) bug. See #9988

			vec3 q0 = vec3( dFdx( eye_pos.x ), dFdx( eye_pos.y ), dFdx( eye_pos.z ) );
			vec3 q1 = vec3( dFdy( eye_pos.x ), dFdy( eye_pos.y ), dFdy( eye_pos.z ) );
			vec2 st0 = dFdx( vUv.st );
			vec2 st1 = dFdy( vUv.st );

			float scale = sign( st1.t * st0.s - st0.t * st1.s ); // we do not care about the magnitude

			vec3 S = normalize( ( q0 * st1.t - q1 * st0.t ) * scale );
			vec3 T = normalize( ( - q0 * st1.s + q1 * st0.s ) * scale );
			vec3 N = normalize( surf_norm );
			mat3 tsn = mat3( S, T, N );

			vec3 mapN = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0;

			mapN.xy *= normalScale;
			mapN.xy *= ( float( gl_FrontFacing ) * 2.0 - 1.0 );

			return normalize( tsn * mapN );

		}

	#endif

#endif
`,Ls=`
vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}

vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}

const float PackUpscale = 256. / 255.; // fraction -> 0..1 (including 1)
const float UnpackDownscale = 255. / 256.; // 0..1 -> fraction (excluding 1)

const vec3 PackFactors = vec3( 256. * 256. * 256., 256. * 256.,  256. );
const vec4 UnpackFactors = UnpackDownscale / vec4( PackFactors, 1. );

const float ShiftRight8 = 1. / 256.;

vec4 packDepthToRGBA( const in float v ) {
	vec4 r = vec4( fract( v * PackFactors ), v );
	r.yzw -= r.xyz * ShiftRight8; // tidy overflow
	return r * PackUpscale;
}

float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors );
}

// NOTE: viewZ/eyeZ is < 0 when in front of the camera per OpenGL conventions

float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float linearClipZ, const in float near, const in float far ) {
	return linearClipZ * ( near - far ) - near;
}

float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return (( near + viewZ ) * far ) / (( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float invClipZ, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * invClipZ - far );
}
`,As=`
#ifdef PREMULTIPLIED_ALPHA

	// Get get normal blending with premultipled, use with CustomBlending, OneFactor, OneMinusSrcAlphaFactor, AddEquation.
	gl_FragColor.rgb *= gl_FragColor.a;

#endif
`,Rs=`
vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );

gl_Position = projectionMatrix * mvPosition;
`,Ps=`
#if defined( DITHERING )

  gl_FragColor.rgb = dithering( gl_FragColor.rgb );

#endif
`,Cs=`
#if defined( DITHERING )

	// based on https://www.shadertoy.com/view/MslGR8
	vec3 dithering( vec3 color ) {
		//Calculate grid position
		float grid_position = rand( gl_FragCoord.xy );

		//Shift the individual colors differently, thus making it even harder to see the dithering pattern
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );

		//modify shift acording to grid position.
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );

		//shift the color by dither_shift
		return color + dither_shift_RGB;
	}

#endif
`,Ds=`
float roughnessFactor = roughness;

#ifdef USE_ROUGHNESSMAP

	vec4 texelRoughness = texture2D( roughnessMap, vUv );

	// reads channel G, compatible with a combined OcclusionRoughnessMetallic (RGB) texture
	roughnessFactor *= texelRoughness.g;

#endif
`,Fs=`
#ifdef USE_ROUGHNESSMAP

	uniform sampler2D roughnessMap;

#endif
`,Us=`
#ifdef USE_SHADOWMAP

	#if NUM_DIR_LIGHTS > 0

		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHTS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHTS ];

	#endif

	#if NUM_SPOT_LIGHTS > 0

		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHTS ];
		varying vec4 vSpotShadowCoord[ NUM_SPOT_LIGHTS ];

	#endif

	#if NUM_POINT_LIGHTS > 0

		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHTS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHTS ];

	#endif

	/*
	#if NUM_RECT_AREA_LIGHTS > 0

		// TODO (abelnation): create uniforms for area light shadows

	#endif
	*/

	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {

		return step( compare, unpackRGBAToDepth( texture2D( depths, uv ) ) );

	}

	float texture2DShadowLerp( sampler2D depths, vec2 size, vec2 uv, float compare ) {

		const vec2 offset = vec2( 0.0, 1.0 );

		vec2 texelSize = vec2( 1.0 ) / size;
		vec2 centroidUV = floor( uv * size + 0.5 ) / size;

		float lb = texture2DCompare( depths, centroidUV + texelSize * offset.xx, compare );
		float lt = texture2DCompare( depths, centroidUV + texelSize * offset.xy, compare );
		float rb = texture2DCompare( depths, centroidUV + texelSize * offset.yx, compare );
		float rt = texture2DCompare( depths, centroidUV + texelSize * offset.yy, compare );

		vec2 f = fract( uv * size + 0.5 );

		float a = mix( lb, lt, f.y );
		float b = mix( rb, rt, f.y );
		float c = mix( a, b, f.x );

		return c;

	}

	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord ) {

		float shadow = 1.0;

		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;

		// if ( something && something ) breaks ATI OpenGL shader compiler
		// if ( all( something, something ) ) using this instead

		bvec4 inFrustumVec = bvec4 ( shadowCoord.x >= 0.0, shadowCoord.x <= 1.0, shadowCoord.y >= 0.0, shadowCoord.y <= 1.0 );
		bool inFrustum = all( inFrustumVec );

		bvec2 frustumTestVec = bvec2( inFrustum, shadowCoord.z <= 1.0 );

		bool frustumTest = all( frustumTestVec );

		if ( frustumTest ) {

		#if defined( SHADOWMAP_TYPE_PCF )

			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;

			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;

			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 9.0 );

		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )

			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;

			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;

			shadow = (
				texture2DShadowLerp( shadowMap, shadowMapSize, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DShadowLerp( shadowMap, shadowMapSize, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DShadowLerp( shadowMap, shadowMapSize, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DShadowLerp( shadowMap, shadowMapSize, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DShadowLerp( shadowMap, shadowMapSize, shadowCoord.xy, shadowCoord.z ) +
				texture2DShadowLerp( shadowMap, shadowMapSize, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DShadowLerp( shadowMap, shadowMapSize, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DShadowLerp( shadowMap, shadowMapSize, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DShadowLerp( shadowMap, shadowMapSize, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 9.0 );

		#else // no percentage-closer filtering:

			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );

		#endif

		}

		return shadow;

	}

	// cubeToUV() maps a 3D direction vector suitable for cube texture mapping to a 2D
	// vector suitable for 2D texture mapping. This code uses the following layout for the
	// 2D texture:
	//
	// xzXZ
	//  y Y
	//
	// Y - Positive y direction
	// y - Negative y direction
	// X - Positive x direction
	// x - Negative x direction
	// Z - Positive z direction
	// z - Negative z direction
	//
	// Source and test bed:
	// https://gist.github.com/tschw/da10c43c467ce8afd0c4

	vec2 cubeToUV( vec3 v, float texelSizeY ) {

		// Number of texels to avoid at the edge of each square

		vec3 absV = abs( v );

		// Intersect unit cube

		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;

		// Apply scale to avoid seams

		// two texels less per square (one texel will do for NEAREST)
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );

		// Unwrap

		// space: -1 ... 1 range for each square
		//
		// #X##		dim    := ( 4 , 2 )
		//  # #		center := ( 1 , 1 )

		vec2 planar = v.xy;

		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;

		if ( absV.z >= almostOne ) {

			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;

		} else if ( absV.x >= almostOne ) {

			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;

		} else if ( absV.y >= almostOne ) {

			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;

		}

		// Transform to UV space

		// scale := 0.5 / dim
		// translate := ( center + 0.5 ) / dim
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );

	}

	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {

		vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );

		// for point lights, the uniform @vShadowCoord is re-purposed to hold
		// the vector from the light to the world-space position of the fragment.
		vec3 lightToPosition = shadowCoord.xyz;

		// dp = normalized distance from light to fragment position
		float dp = ( length( lightToPosition ) - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear ); // need to clamp?
		dp += shadowBias;

		// bd3D = base direction 3D
		vec3 bd3D = normalize( lightToPosition );

		#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT )

			vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;

			return (
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
			) * ( 1.0 / 9.0 );

		#else // no percentage-closer filtering

			return texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );

		#endif

	}

#endif
`,Is=`
#ifdef USE_SHADOWMAP

	#if NUM_DIR_LIGHTS > 0

		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHTS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHTS ];

	#endif

	#if NUM_SPOT_LIGHTS > 0

		uniform mat4 spotShadowMatrix[ NUM_SPOT_LIGHTS ];
		varying vec4 vSpotShadowCoord[ NUM_SPOT_LIGHTS ];

	#endif

	#if NUM_POINT_LIGHTS > 0

		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHTS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHTS ];

	#endif

	/*
	#if NUM_RECT_AREA_LIGHTS > 0

		// TODO (abelnation): uniforms for area light shadows

	#endif
	*/

#endif
`,Ns=`
#ifdef USE_SHADOWMAP

	#if NUM_DIR_LIGHTS > 0

	#pragma unroll_loop
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

		vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * worldPosition;

	}

	#endif

	#if NUM_SPOT_LIGHTS > 0

	#pragma unroll_loop
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {

		vSpotShadowCoord[ i ] = spotShadowMatrix[ i ] * worldPosition;

	}

	#endif

	#if NUM_POINT_LIGHTS > 0

	#pragma unroll_loop
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {

		vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * worldPosition;

	}

	#endif

	/*
	#if NUM_RECT_AREA_LIGHTS > 0

		// TODO (abelnation): update vAreaShadowCoord with area light info

	#endif
	*/

#endif
`,Bs=`
float getShadowMask() {

	float shadow = 1.0;

	#ifdef USE_SHADOWMAP

	#if NUM_DIR_LIGHTS > 0

	DirectionalLight directionalLight;

	#pragma unroll_loop
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

		directionalLight = directionalLights[ i ];
		shadow *= bool( directionalLight.shadow ) ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;

	}

	#endif

	#if NUM_SPOT_LIGHTS > 0

	SpotLight spotLight;

	#pragma unroll_loop
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {

		spotLight = spotLights[ i ];
		shadow *= bool( spotLight.shadow ) ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowBias, spotLight.shadowRadius, vSpotShadowCoord[ i ] ) : 1.0;

	}

	#endif

	#if NUM_POINT_LIGHTS > 0

	PointLight pointLight;

	#pragma unroll_loop
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {

		pointLight = pointLights[ i ];
		shadow *= bool( pointLight.shadow ) ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;

	}

	#endif

	/*
	#if NUM_RECT_AREA_LIGHTS > 0

		// TODO (abelnation): update shadow for Area light

	#endif
	*/

	#endif

	return shadow;

}
`,Os=`
#ifdef USE_SKINNING

	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );

#endif
`,zs=`
#ifdef USE_SKINNING

	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;

	#ifdef BONE_TEXTURE

		uniform sampler2D boneTexture;
		uniform int boneTextureSize;

		mat4 getBoneMatrix( const in float i ) {

			float j = i * 4.0;
			float x = mod( j, float( boneTextureSize ) );
			float y = floor( j / float( boneTextureSize ) );

			float dx = 1.0 / float( boneTextureSize );
			float dy = 1.0 / float( boneTextureSize );

			y = dy * ( y + 0.5 );

			vec4 v1 = texture2D( boneTexture, vec2( dx * ( x + 0.5 ), y ) );
			vec4 v2 = texture2D( boneTexture, vec2( dx * ( x + 1.5 ), y ) );
			vec4 v3 = texture2D( boneTexture, vec2( dx * ( x + 2.5 ), y ) );
			vec4 v4 = texture2D( boneTexture, vec2( dx * ( x + 3.5 ), y ) );

			mat4 bone = mat4( v1, v2, v3, v4 );

			return bone;

		}

	#else

		uniform mat4 boneMatrices[ MAX_BONES ];

		mat4 getBoneMatrix( const in float i ) {

			mat4 bone = boneMatrices[ int(i) ];
			return bone;

		}

	#endif

#endif
`,Gs=`
#ifdef USE_SKINNING

	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );

	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;

	transformed = ( bindMatrixInverse * skinned ).xyz;

#endif
`,Vs=`
#ifdef USE_SKINNING

	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix  = bindMatrixInverse * skinMatrix * bindMatrix;

	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;

#endif
`,Hs=`
float specularStrength;

#ifdef USE_SPECULARMAP

	vec4 texelSpecular = texture2D( specularMap, vUv );
	specularStrength = texelSpecular.r;

#else

	specularStrength = 1.0;

#endif
`,ks=`
#ifdef USE_SPECULARMAP

	uniform sampler2D specularMap;

#endif
`,Ws=`
#if defined( TONE_MAPPING )

  gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );

#endif
`,Xs=`
#ifndef saturate
	#define saturate(a) clamp( a, 0.0, 1.0 )
#endif

uniform float toneMappingExposure;
uniform float toneMappingWhitePoint;

// exposure only
vec3 LinearToneMapping( vec3 color ) {

	return toneMappingExposure * color;

}

// source: https://www.cs.utah.edu/~reinhard/cdrom/
vec3 ReinhardToneMapping( vec3 color ) {

	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );

}

// source: http://filmicgames.com/archives/75
#define Uncharted2Helper( x ) max( ( ( x * ( 0.15 * x + 0.10 * 0.50 ) + 0.20 * 0.02 ) / ( x * ( 0.15 * x + 0.50 ) + 0.20 * 0.30 ) ) - 0.02 / 0.30, vec3( 0.0 ) )
vec3 Uncharted2ToneMapping( vec3 color ) {

	// John Hable's filmic operator from Uncharted 2 video game
	color *= toneMappingExposure;
	return saturate( Uncharted2Helper( color ) / Uncharted2Helper( vec3( toneMappingWhitePoint ) ) );

}

// source: http://filmicgames.com/archives/75
vec3 OptimizedCineonToneMapping( vec3 color ) {

	// optimized filmic operator by Jim Hejl and Richard Burgess-Dawson
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );

}

// source: https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
vec3 ACESFilmicToneMapping( vec3 color ) {

	color *= toneMappingExposure;
	return saturate( ( color * ( 2.51 * color + 0.03 ) ) / ( color * ( 2.43 * color + 0.59 ) + 0.14 ) );

}
`,qs=`
#if defined( USE_MAP ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( USE_SPECULARMAP ) || defined( USE_ALPHAMAP ) || defined( USE_EMISSIVEMAP ) || defined( USE_ROUGHNESSMAP ) || defined( USE_METALNESSMAP )

	varying vec2 vUv;

#endif
`,Ys=`
#if defined( USE_MAP ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( USE_SPECULARMAP ) || defined( USE_ALPHAMAP ) || defined( USE_EMISSIVEMAP ) || defined( USE_ROUGHNESSMAP ) || defined( USE_METALNESSMAP )

	varying vec2 vUv;
	uniform mat3 uvTransform;

#endif
`,js=`
#if defined( USE_MAP ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( USE_SPECULARMAP ) || defined( USE_ALPHAMAP ) || defined( USE_EMISSIVEMAP ) || defined( USE_ROUGHNESSMAP ) || defined( USE_METALNESSMAP )

	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;

#endif
`,Zs=`
#if defined( USE_LIGHTMAP ) || defined( USE_AOMAP )

	varying vec2 vUv2;

#endif
`,Js=`
#if defined( USE_LIGHTMAP ) || defined( USE_AOMAP )

	attribute vec2 uv2;
	varying vec2 vUv2;

#endif
`,Qs=`
#if defined( USE_LIGHTMAP ) || defined( USE_AOMAP )

	vUv2 = uv2;

#endif
`,Ks=`
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP )

	vec4 worldPosition = modelMatrix * vec4( transformed, 1.0 );

#endif
`,$s=`
uniform sampler2D t2D;

varying vec2 vUv;

void main() {

	vec4 texColor = texture2D( t2D, vUv );

	gl_FragColor = mapTexelToLinear( texColor );

	#include <tonemapping_fragment>
	#include <encodings_fragment>

}
`,eo=`
varying vec2 vUv;
uniform mat3 uvTransform;

void main() {

	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;

	gl_Position = vec4( position.xy, 1.0, 1.0 );

}
`,to=`
uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;

varying vec3 vWorldDirection;

void main() {

	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );

	gl_FragColor = mapTexelToLinear( texColor );
	gl_FragColor.a *= opacity;

	#include <tonemapping_fragment>
	#include <encodings_fragment>

}
`,io=`
varying vec3 vWorldDirection;

#include <common>

void main() {

	vWorldDirection = transformDirection( position, modelMatrix );

	#include <begin_vertex>
	#include <project_vertex>

	gl_Position.z = gl_Position.w; // set z to camera.far

}
`,ro=`
#if DEPTH_PACKING == 3200

	uniform float opacity;

#endif

#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

void main() {

	#include <clipping_planes_fragment>

	vec4 diffuseColor = vec4( 1.0 );

	#if DEPTH_PACKING == 3200

		diffuseColor.a = opacity;

	#endif

	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>

	#include <logdepthbuf_fragment>

	#if DEPTH_PACKING == 3200

		gl_FragColor = vec4( vec3( 1.0 - gl_FragCoord.z ), opacity );

	#elif DEPTH_PACKING == 3201

		gl_FragColor = packDepthToRGBA( gl_FragCoord.z );

	#endif

}
`,no=`
#include <common>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

void main() {

	#include <uv_vertex>

	#include <skinbase_vertex>

	#ifdef USE_DISPLACEMENTMAP

		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>

	#endif

	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>

}
`,ao=`
#define DISTANCE

uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;

#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <clipping_planes_pars_fragment>

void main () {

	#include <clipping_planes_fragment>

	vec4 diffuseColor = vec4( 1.0 );

	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>

	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist ); // clamp to [ 0, 1 ]

	gl_FragColor = packDepthToRGBA( dist );

}
`,so=`
#define DISTANCE

varying vec3 vWorldPosition;

#include <common>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>

void main() {

	#include <uv_vertex>

	#include <skinbase_vertex>

	#ifdef USE_DISPLACEMENTMAP

		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>

	#endif

	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>

	vWorldPosition = worldPosition.xyz;

}
`,oo=`
uniform sampler2D tEquirect;

varying vec3 vWorldDirection;

#include <common>

void main() {

	vec3 direction = normalize( vWorldDirection );

	vec2 sampleUV;

	sampleUV.y = asin( clamp( direction.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;

	sampleUV.x = atan( direction.z, direction.x ) * RECIPROCAL_PI2 + 0.5;

	vec4 texColor = texture2D( tEquirect, sampleUV );

	gl_FragColor = mapTexelToLinear( texColor );

	#include <tonemapping_fragment>
	#include <encodings_fragment>

}
`,lo=`
varying vec3 vWorldDirection;

#include <common>

void main() {

	vWorldDirection = transformDirection( position, modelMatrix );

	#include <begin_vertex>
	#include <project_vertex>

}
`,uo=`
uniform vec3 diffuse;
uniform float opacity;

uniform float dashSize;
uniform float totalSize;

varying float vLineDistance;

#include <common>
#include <color_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

void main() {

	#include <clipping_planes_fragment>

	if ( mod( vLineDistance, totalSize ) > dashSize ) {

		discard;

	}

	vec3 outgoingLight = vec3( 0.0 );
	vec4 diffuseColor = vec4( diffuse, opacity );

	#include <logdepthbuf_fragment>
	#include <color_fragment>

	outgoingLight = diffuseColor.rgb; // simple shader

	gl_FragColor = vec4( outgoingLight, diffuseColor.a );

	#include <premultiplied_alpha_fragment>
	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>

}
`,fo=`
uniform float scale;
attribute float lineDistance;

varying float vLineDistance;

#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

void main() {

	#include <color_vertex>

	vLineDistance = scale * lineDistance;

	vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
	gl_Position = projectionMatrix * mvPosition;

	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>

}
`,co=`
uniform vec3 diffuse;
uniform float opacity;

#ifndef FLAT_SHADED

	varying vec3 vNormal;

#endif

#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <uv2_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

void main() {

	#include <clipping_planes_fragment>

	vec4 diffuseColor = vec4( diffuse, opacity );

	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <specularmap_fragment>

	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );

	// accumulation (baked indirect lighting only)
	#ifdef USE_LIGHTMAP

		reflectedLight.indirectDiffuse += texture2D( lightMap, vUv2 ).xyz * lightMapIntensity;

	#else

		reflectedLight.indirectDiffuse += vec3( 1.0 );

	#endif

	// modulation
	#include <aomap_fragment>

	reflectedLight.indirectDiffuse *= diffuseColor.rgb;

	vec3 outgoingLight = reflectedLight.indirectDiffuse;

	#include <envmap_fragment>

	gl_FragColor = vec4( outgoingLight, diffuseColor.a );

	#include <premultiplied_alpha_fragment>
	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>

}
`,ho=`
#include <common>
#include <uv_pars_vertex>
#include <uv2_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

void main() {

	#include <uv_vertex>
	#include <uv2_vertex>
	#include <color_vertex>
	#include <skinbase_vertex>

	#ifdef USE_ENVMAP

	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>

	#endif

	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>

	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>

}
`,po=`
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;

varying vec3 vLightFront;

#ifdef DOUBLE_SIDED

	varying vec3 vLightBack;

#endif

#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <uv2_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <fog_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

void main() {

	#include <clipping_planes_fragment>

	vec4 diffuseColor = vec4( diffuse, opacity );
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;

	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <specularmap_fragment>
	#include <emissivemap_fragment>

	// accumulation
	reflectedLight.indirectDiffuse = getAmbientLightIrradiance( ambientLightColor );

	#include <lightmap_fragment>

	reflectedLight.indirectDiffuse *= BRDF_Diffuse_Lambert( diffuseColor.rgb );

	#ifdef DOUBLE_SIDED

		reflectedLight.directDiffuse = ( gl_FrontFacing ) ? vLightFront : vLightBack;

	#else

		reflectedLight.directDiffuse = vLightFront;

	#endif

	reflectedLight.directDiffuse *= BRDF_Diffuse_Lambert( diffuseColor.rgb ) * getShadowMask();

	// modulation
	#include <aomap_fragment>

	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;

	#include <envmap_fragment>

	gl_FragColor = vec4( outgoingLight, diffuseColor.a );

	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>

}
`,mo=`
#define LAMBERT

varying vec3 vLightFront;

#ifdef DOUBLE_SIDED

	varying vec3 vLightBack;

#endif

#include <common>
#include <uv_pars_vertex>
#include <uv2_pars_vertex>
#include <envmap_pars_vertex>
#include <bsdfs>
#include <lights_pars_begin>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

void main() {

	#include <uv_vertex>
	#include <uv2_vertex>
	#include <color_vertex>

	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>

	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>

	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <lights_lambert_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>

}
`,vo=`
#define MATCAP

uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;

varying vec3 vViewPosition;

#ifndef FLAT_SHADED

	varying vec3 vNormal;

#endif

#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>

#include <fog_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

void main() {

	#include <clipping_planes_fragment>

	vec4 diffuseColor = vec4( diffuse, opacity );

	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>

	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5; // 0.495 to remove artifacts caused by undersized matcap disks

	#ifdef USE_MATCAP

		vec4 matcapColor = texture2D( matcap, uv );
		matcapColor = matcapTexelToLinear( matcapColor );

	#else

		vec4 matcapColor = vec4( 1.0 );

	#endif

	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;

	gl_FragColor = vec4( outgoingLight, diffuseColor.a );

	#include <premultiplied_alpha_fragment>
	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>

}
`,go=`
#define MATCAP

varying vec3 vViewPosition;

#ifndef FLAT_SHADED

	varying vec3 vNormal;

#endif

#include <common>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>

#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

void main() {

	#include <uv_vertex>

	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>

	#ifndef FLAT_SHADED // Normal computed with derivatives when FLAT_SHADED

		vNormal = normalize( transformedNormal );

	#endif

	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>

	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>

	vViewPosition = - mvPosition.xyz;

}
`,_o=`
#define PHONG

uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;

#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <uv2_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

void main() {

	#include <clipping_planes_fragment>

	vec4 diffuseColor = vec4( diffuse, opacity );
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;

	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>

	// accumulation
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>

	// modulation
	#include <aomap_fragment>

	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;

	#include <envmap_fragment>

	gl_FragColor = vec4( outgoingLight, diffuseColor.a );

	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>

}
`,xo=`
#define PHONG

varying vec3 vViewPosition;

#ifndef FLAT_SHADED

	varying vec3 vNormal;

#endif

#include <common>
#include <uv_pars_vertex>
#include <uv2_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

void main() {

	#include <uv_vertex>
	#include <uv2_vertex>
	#include <color_vertex>

	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>

#ifndef FLAT_SHADED // Normal computed with derivatives when FLAT_SHADED

	vNormal = normalize( transformedNormal );

#endif

	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>

	vViewPosition = - mvPosition.xyz;

	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>

}
`,yo=`
#define PHYSICAL

uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;

#ifndef STANDARD
	uniform float clearCoat;
	uniform float clearCoatRoughness;
#endif

varying vec3 vViewPosition;

#ifndef FLAT_SHADED

	varying vec3 vNormal;

#endif

#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <uv2_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <bsdfs>
#include <cube_uv_reflection_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <lights_physical_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

void main() {

	#include <clipping_planes_fragment>

	vec4 diffuseColor = vec4( diffuse, opacity );
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;

	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>

	// accumulation
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>

	// modulation
	#include <aomap_fragment>

	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;

	gl_FragColor = vec4( outgoingLight, diffuseColor.a );

	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>

}
`,Mo=`
#define PHYSICAL

varying vec3 vViewPosition;

#ifndef FLAT_SHADED

	varying vec3 vNormal;

#endif

#include <common>
#include <uv_pars_vertex>
#include <uv2_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

void main() {

	#include <uv_vertex>
	#include <uv2_vertex>
	#include <color_vertex>

	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>

#ifndef FLAT_SHADED // Normal computed with derivatives when FLAT_SHADED

	vNormal = normalize( transformedNormal );

#endif

	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>

	vViewPosition = - mvPosition.xyz;

	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>

}
`,Eo=`
#define NORMAL

uniform float opacity;

#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || ( defined( USE_NORMALMAP ) && ! defined( OBJECTSPACE_NORMALMAP ) )

	varying vec3 vViewPosition;

#endif

#ifndef FLAT_SHADED

	varying vec3 vNormal;

#endif

#include <packing>
#include <uv_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>

void main() {

	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>

	gl_FragColor = vec4( packNormalToRGB( normal ), opacity );

}
`,wo=`
#define NORMAL

#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || ( defined( USE_NORMALMAP ) && ! defined( OBJECTSPACE_NORMALMAP ) )

	varying vec3 vViewPosition;

#endif

#ifndef FLAT_SHADED

	varying vec3 vNormal;

#endif

#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>

void main() {

	#include <uv_vertex>

	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>

#ifndef FLAT_SHADED // Normal computed with derivatives when FLAT_SHADED

	vNormal = normalize( transformedNormal );

#endif

	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>

#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || ( defined( USE_NORMALMAP ) && ! defined( OBJECTSPACE_NORMALMAP ) )

	vViewPosition = - mvPosition.xyz;

#endif

}
`,bo=`
uniform vec3 diffuse;
uniform float opacity;

#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

void main() {

	#include <clipping_planes_fragment>

	vec3 outgoingLight = vec3( 0.0 );
	vec4 diffuseColor = vec4( diffuse, opacity );

	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>

	outgoingLight = diffuseColor.rgb;

	gl_FragColor = vec4( outgoingLight, diffuseColor.a );

	#include <premultiplied_alpha_fragment>
	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>

}
`,So=`
uniform float size;
uniform float scale;

#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

void main() {

	#include <color_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>

	gl_PointSize = size;

	#ifdef USE_SIZEATTENUATION

		bool isPerspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 );

		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );

	#endif

	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>

}
`,To=`
uniform vec3 color;
uniform float opacity;

#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>

void main() {

	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );

	#include <fog_fragment>

}
`,Lo=`
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>

void main() {

	#include <begin_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>

}
`,Ao=`
uniform vec3 diffuse;
uniform float opacity;

#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

void main() {

	#include <clipping_planes_fragment>

	vec3 outgoingLight = vec3( 0.0 );
	vec4 diffuseColor = vec4( diffuse, opacity );

	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphatest_fragment>

	outgoingLight = diffuseColor.rgb;

	gl_FragColor = vec4( outgoingLight, diffuseColor.a );

	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>

}
`,Ro=`
uniform float rotation;
uniform vec2 center;

#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

void main() {

	#include <uv_vertex>

	vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );

	vec2 scale;
	scale.x = length( vec3( modelMatrix[ 0 ].x, modelMatrix[ 0 ].y, modelMatrix[ 0 ].z ) );
	scale.y = length( vec3( modelMatrix[ 1 ].x, modelMatrix[ 1 ].y, modelMatrix[ 1 ].z ) );

	#ifndef USE_SIZEATTENUATION

		bool isPerspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 );

		if ( isPerspective ) scale *= - mvPosition.z;

	#endif

	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;

	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;

	mvPosition.xy += rotatedPosition;

	gl_Position = projectionMatrix * mvPosition;

	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>

}
`;var ue={alphamap_fragment:_a,alphamap_pars_fragment:xa,alphatest_fragment:ya,aomap_fragment:Ma,aomap_pars_fragment:Ea,begin_vertex:wa,beginnormal_vertex:ba,bsdfs:Sa,bumpmap_pars_fragment:Ta,clipping_planes_fragment:La,clipping_planes_pars_fragment:Aa,clipping_planes_pars_vertex:Ra,clipping_planes_vertex:Pa,color_fragment:Ca,color_pars_fragment:Da,color_pars_vertex:Fa,color_vertex:Ua,common:Ia,cube_uv_reflection_fragment:Na,defaultnormal_vertex:Ba,displacementmap_pars_vertex:Oa,displacementmap_vertex:za,emissivemap_fragment:Ga,emissivemap_pars_fragment:Va,encodings_fragment:Ha,encodings_pars_fragment:ka,envmap_fragment:Wa,envmap_pars_fragment:Xa,envmap_pars_vertex:qa,envmap_physical_pars_fragment:rs,envmap_vertex:Ya,fog_vertex:ja,fog_pars_vertex:Za,fog_fragment:Ja,fog_pars_fragment:Qa,gradientmap_pars_fragment:Ka,lightmap_fragment:$a,lightmap_pars_fragment:es,lights_lambert_vertex:ts,lights_pars_begin:is,lights_phong_fragment:ns,lights_phong_pars_fragment:as,lights_physical_fragment:ss,lights_physical_pars_fragment:os,lights_fragment_begin:ls,lights_fragment_maps:us,lights_fragment_end:fs,logdepthbuf_fragment:cs,logdepthbuf_pars_fragment:hs,logdepthbuf_pars_vertex:ds,logdepthbuf_vertex:ps,map_fragment:ms,map_pars_fragment:vs,map_particle_fragment:gs,map_particle_pars_fragment:_s,metalnessmap_fragment:xs,metalnessmap_pars_fragment:ys,morphnormal_vertex:Ms,morphtarget_pars_vertex:Es,morphtarget_vertex:ws,normal_fragment_begin:bs,normal_fragment_maps:Ss,normalmap_pars_fragment:Ts,packing:Ls,premultiplied_alpha_fragment:As,project_vertex:Rs,dithering_fragment:Ps,dithering_pars_fragment:Cs,roughnessmap_fragment:Ds,roughnessmap_pars_fragment:Fs,shadowmap_pars_fragment:Us,shadowmap_pars_vertex:Is,shadowmap_vertex:Ns,shadowmask_pars_fragment:Bs,skinbase_vertex:Os,skinning_pars_vertex:zs,skinning_vertex:Gs,skinnormal_vertex:Vs,specularmap_fragment:Hs,specularmap_pars_fragment:ks,tonemapping_fragment:Ws,tonemapping_pars_fragment:Xs,uv_pars_fragment:qs,uv_pars_vertex:Ys,uv_vertex:js,uv2_pars_fragment:Zs,uv2_pars_vertex:Js,uv2_vertex:Qs,worldpos_vertex:Ks,background_frag:$s,background_vert:eo,cube_frag:to,cube_vert:io,depth_frag:ro,depth_vert:no,distanceRGBA_frag:ao,distanceRGBA_vert:so,equirect_frag:oo,equirect_vert:lo,linedashed_frag:uo,linedashed_vert:fo,meshbasic_frag:co,meshbasic_vert:ho,meshlambert_frag:po,meshlambert_vert:mo,meshmatcap_frag:vo,meshmatcap_vert:go,meshphong_frag:_o,meshphong_vert:xo,meshphysical_frag:yo,meshphysical_vert:Mo,normal_frag:Eo,normal_vert:wo,points_frag:bo,points_vert:So,shadow_frag:To,shadow_vert:Lo,sprite_frag:Ao,sprite_vert:Ro},Z={common:{diffuse:{value:new Ae(15658734)},opacity:{value:1},map:{value:null},uvTransform:{value:new je},alphaMap:{value:null}},specularmap:{specularMap:{value:null}},envmap:{envMap:{value:null},flipEnvMap:{value:-1},reflectivity:{value:1},refractionRatio:{value:.98},maxMipLevel:{value:0}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1}},emissivemap:{emissiveMap:{value:null}},bumpmap:{bumpMap:{value:null},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalScale:{value:new de(1,1)}},displacementmap:{displacementMap:{value:null},displacementScale:{value:1},displacementBias:{value:0}},roughnessmap:{roughnessMap:{value:null}},metalnessmap:{metalnessMap:{value:null}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Ae(16777215)}},lights:{ambientLightColor:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{},shadow:{},shadowBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{},shadow:{},shadowBias:{},shadowRadius:{},shadowMapSize:{}}},spotShadowMap:{value:[]},spotShadowMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{},shadow:{},shadowBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}}},points:{diffuse:{value:new Ae(15658734)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},uvTransform:{value:new je}},sprite:{diffuse:{value:new Ae(15658734)},opacity:{value:1},center:{value:new de(.5,.5)},rotation:{value:0},map:{value:null},uvTransform:{value:new je}}},it={basic:{uniforms:ke([Z.common,Z.specularmap,Z.envmap,Z.aomap,Z.lightmap,Z.fog]),vertexShader:ue.meshbasic_vert,fragmentShader:ue.meshbasic_frag},lambert:{uniforms:ke([Z.common,Z.specularmap,Z.envmap,Z.aomap,Z.lightmap,Z.emissivemap,Z.fog,Z.lights,{emissive:{value:new Ae(0)}}]),vertexShader:ue.meshlambert_vert,fragmentShader:ue.meshlambert_frag},phong:{uniforms:ke([Z.common,Z.specularmap,Z.envmap,Z.aomap,Z.lightmap,Z.emissivemap,Z.bumpmap,Z.normalmap,Z.displacementmap,Z.gradientmap,Z.fog,Z.lights,{emissive:{value:new Ae(0)},specular:{value:new Ae(1118481)},shininess:{value:30}}]),vertexShader:ue.meshphong_vert,fragmentShader:ue.meshphong_frag},standard:{uniforms:ke([Z.common,Z.envmap,Z.aomap,Z.lightmap,Z.emissivemap,Z.bumpmap,Z.normalmap,Z.displacementmap,Z.roughnessmap,Z.metalnessmap,Z.fog,Z.lights,{emissive:{value:new Ae(0)},roughness:{value:.5},metalness:{value:.5},envMapIntensity:{value:1}}]),vertexShader:ue.meshphysical_vert,fragmentShader:ue.meshphysical_frag},matcap:{uniforms:ke([Z.common,Z.bumpmap,Z.normalmap,Z.displacementmap,Z.fog,{matcap:{value:null}}]),vertexShader:ue.meshmatcap_vert,fragmentShader:ue.meshmatcap_frag},points:{uniforms:ke([Z.points,Z.fog]),vertexShader:ue.points_vert,fragmentShader:ue.points_frag},dashed:{uniforms:ke([Z.common,Z.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:ue.linedashed_vert,fragmentShader:ue.linedashed_frag},depth:{uniforms:ke([Z.common,Z.displacementmap]),vertexShader:ue.depth_vert,fragmentShader:ue.depth_frag},normal:{uniforms:ke([Z.common,Z.bumpmap,Z.normalmap,Z.displacementmap,{opacity:{value:1}}]),vertexShader:ue.normal_vert,fragmentShader:ue.normal_frag},sprite:{uniforms:ke([Z.sprite,Z.fog]),vertexShader:ue.sprite_vert,fragmentShader:ue.sprite_frag},background:{uniforms:{uvTransform:{value:new je},t2D:{value:null}},vertexShader:ue.background_vert,fragmentShader:ue.background_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:ue.cube_vert,fragmentShader:ue.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:ue.equirect_vert,fragmentShader:ue.equirect_frag},distanceRGBA:{uniforms:ke([Z.common,Z.displacementmap,{referencePosition:{value:new T},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:ue.distanceRGBA_vert,fragmentShader:ue.distanceRGBA_frag},shadow:{uniforms:ke([Z.lights,Z.fog,{color:{value:new Ae(0)},opacity:{value:1}}]),vertexShader:ue.shadow_vert,fragmentShader:ue.shadow_frag}};it.physical={uniforms:ke([it.standard.uniforms,{clearCoat:{value:0},clearCoatRoughness:{value:0}}]),vertexShader:ue.meshphysical_vert,fragmentShader:ue.meshphysical_frag};function Li(){var e=null,t=!1,i=null;function r(n,a){t!==!1&&(i(n,a),e.requestAnimationFrame(r))}return{start:function(){t!==!0&&i!==null&&(e.requestAnimationFrame(r),t=!0)},stop:function(){t=!1},setAnimationLoop:function(n){i=n},setContext:function(n){e=n}}}function Po(e){var t=new WeakMap;function i(o,u){var l=o.array,f=o.dynamic?e.DYNAMIC_DRAW:e.STATIC_DRAW,c=e.createBuffer();e.bindBuffer(u,c),e.bufferData(u,l,f),o.onUploadCallback();var h=e.FLOAT;return l instanceof Float32Array?h=e.FLOAT:l instanceof Float64Array?console.warn("THREE.WebGLAttributes: Unsupported data buffer format: Float64Array."):l instanceof Uint16Array?h=e.UNSIGNED_SHORT:l instanceof Int16Array?h=e.SHORT:l instanceof Uint32Array?h=e.UNSIGNED_INT:l instanceof Int32Array?h=e.INT:l instanceof Int8Array?h=e.BYTE:l instanceof Uint8Array&&(h=e.UNSIGNED_BYTE),{buffer:c,type:h,bytesPerElement:l.BYTES_PER_ELEMENT,version:o.version}}function r(o,u,l){var f=u.array,c=u.updateRange;e.bindBuffer(l,o),u.dynamic===!1?e.bufferData(l,f,e.STATIC_DRAW):c.count===-1?e.bufferSubData(l,0,f):c.count===0?console.error("THREE.WebGLObjects.updateBuffer: dynamic THREE.BufferAttribute marked as needsUpdate but updateRange.count is 0, ensure you are using set methods or updating manually."):(e.bufferSubData(l,c.offset*f.BYTES_PER_ELEMENT,f.subarray(c.offset,c.offset+c.count)),c.count=-1)}function n(o){return o.isInterleavedBufferAttribute&&(o=o.data),t.get(o)}function a(o){o.isInterleavedBufferAttribute&&(o=o.data);var u=t.get(o);u&&(e.deleteBuffer(u.buffer),t.delete(o))}function s(o,u){o.isInterleavedBufferAttribute&&(o=o.data);var l=t.get(o);l===void 0?t.set(o,i(o,u)):l.version<o.version&&(r(l.buffer,o,u),l.version=o.version)}return{get:n,remove:a,update:s}}function wi(e,t,i,r,n,a){lt.call(this),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:i,widthSegments:r,heightSegments:n,depthSegments:a},this.fromBufferGeometry(new Nt(e,t,i,r,n,a)),this.mergeVertices()}wi.prototype=Object.create(lt.prototype);wi.prototype.constructor=wi;function Nt(e,t,i,r,n,a){Ke.call(this),this.type="BoxBufferGeometry",this.parameters={width:e,height:t,depth:i,widthSegments:r,heightSegments:n,depthSegments:a};var s=this;e=e||1,t=t||1,i=i||1,r=Math.floor(r)||1,n=Math.floor(n)||1,a=Math.floor(a)||1;var o=[],u=[],l=[],f=[],c=0,h=0;p("z","y","x",-1,-1,i,t,e,a,n,0),p("z","y","x",1,-1,i,t,-e,a,n,1),p("x","z","y",1,1,e,i,t,r,a,2),p("x","z","y",1,-1,e,i,-t,r,a,3),p("x","y","z",1,-1,e,t,i,r,n,4),p("x","y","z",-1,-1,e,t,-i,r,n,5),this.setIndex(o),this.addAttribute("position",new Oe(u,3)),this.addAttribute("normal",new Oe(l,3)),this.addAttribute("uv",new Oe(f,2));function p(v,_,M,w,S,L,b,R,P,U,D){var A=L/P,F=b/U,N=L/2,H=b/2,z=R/2,k=P+1,q=U+1,Q=0,K=0,X,g,x=new T;for(g=0;g<q;g++){var I=g*F-H;for(X=0;X<k;X++){var E=X*A-N;x[v]=E*w,x[_]=I*S,x[M]=z,u.push(x.x,x.y,x.z),x[v]=0,x[_]=0,x[M]=R>0?1:-1,l.push(x.x,x.y,x.z),f.push(X/P),f.push(1-g/U),Q+=1}}for(g=0;g<U;g++)for(X=0;X<P;X++){var J=c+X+k*g,O=c+X+k*(g+1),G=c+(X+1)+k*(g+1),V=c+(X+1)+k*g;o.push(J,O,V),o.push(O,G,V),K+=6}s.addGroup(h,K,D),h+=K,c+=Q}}Nt.prototype=Object.create(Ke.prototype);Nt.prototype.constructor=Nt;function Co(e,t,i,r){var n=new Ae(0),a=0,s,o,u=null,l=0;function f(h,p,v,_){var M=p.background;if(M===null?(c(n,a),u=null,l=0):M&&M.isColor&&(c(M,1),_=!0,u=null,l=0),(e.autoClear||_)&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),M&&(M.isCubeTexture||M.isWebGLRenderTargetCube)){o===void 0&&(o=new Ft(new Nt(1,1,1),new nt({type:"BackgroundCubeMaterial",uniforms:Ut(it.cube.uniforms),vertexShader:it.cube.vertexShader,fragmentShader:it.cube.fragmentShader,side:We,depthTest:!0,depthWrite:!1,fog:!1})),o.geometry.removeAttribute("normal"),o.geometry.removeAttribute("uv"),o.onBeforeRender=function(S,L,b){this.matrixWorld.copyPosition(b.matrixWorld)},Object.defineProperty(o.material,"map",{get:function(){return this.uniforms.tCube.value}}),i.update(o));var w=M.isWebGLRenderTargetCube?M.texture:M;o.material.uniforms.tCube.value=w,o.material.uniforms.tFlip.value=M.isWebGLRenderTargetCube?1:-1,(u!==M||l!==w.version)&&(o.material.needsUpdate=!0,u=M,l=w.version),h.unshift(o,o.geometry,o.material,0,0,null)}else M&&M.isTexture&&(s===void 0&&(s=new Ft(new Et(2,2),new nt({type:"BackgroundMaterial",uniforms:Ut(it.background.uniforms),vertexShader:it.background.vertexShader,fragmentShader:it.background.fragmentShader,side:Qt,depthTest:!1,depthWrite:!1,fog:!1})),s.geometry.removeAttribute("normal"),Object.defineProperty(s.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(s)),s.material.uniforms.t2D.value=M,M.matrixAutoUpdate===!0&&M.updateMatrix(),s.material.uniforms.uvTransform.value.copy(M.matrix),(u!==M||l!==M.version)&&(s.material.needsUpdate=!0,u=M,l=M.version),h.unshift(s,s.geometry,s.material,0,0,null))}function c(h,p){t.buffers.color.setClear(h.r,h.g,h.b,p,r)}return{getClearColor:function(){return n},setClearColor:function(h,p){n.set(h),a=p!==void 0?p:1,c(n,a)},getClearAlpha:function(){return a},setClearAlpha:function(h){a=h,c(n,a)},render:f}}function Do(e,t,i,r){var n;function a(u){n=u}function s(u,l){e.drawArrays(n,u,l),i.update(l,n)}function o(u,l,f){var c;if(r.isWebGL2)c=e;else if(c=t.get("ANGLE_instanced_arrays"),c===null){console.error("THREE.WebGLBufferRenderer: using THREE.InstancedBufferGeometry but hardware does not support extension ANGLE_instanced_arrays.");return}c[r.isWebGL2?"drawArraysInstanced":"drawArraysInstancedANGLE"](n,l,f,u.maxInstancedCount),i.update(f,n,u.maxInstancedCount)}this.setMode=a,this.render=s,this.renderInstances=o}function Fo(e,t,i){var r;function n(){if(r!==void 0)return r;var P=t.get("EXT_texture_filter_anisotropic");return P!==null?r=e.getParameter(P.MAX_TEXTURE_MAX_ANISOTROPY_EXT):r=0,r}function a(P){if(P==="highp"){if(e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.HIGH_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.HIGH_FLOAT).precision>0)return"highp";P="mediump"}return P==="mediump"&&e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.MEDIUM_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}var s=typeof WebGL2RenderingContext<"u"&&e instanceof WebGL2RenderingContext,o=i.precision!==void 0?i.precision:"highp",u=a(o);u!==o&&(console.warn("THREE.WebGLRenderer:",o,"not supported, using",u,"instead."),o=u);var l=i.logarithmicDepthBuffer===!0,f=e.getParameter(e.MAX_TEXTURE_IMAGE_UNITS),c=e.getParameter(e.MAX_VERTEX_TEXTURE_IMAGE_UNITS),h=e.getParameter(e.MAX_TEXTURE_SIZE),p=e.getParameter(e.MAX_CUBE_MAP_TEXTURE_SIZE),v=e.getParameter(e.MAX_VERTEX_ATTRIBS),_=e.getParameter(e.MAX_VERTEX_UNIFORM_VECTORS),M=e.getParameter(e.MAX_VARYING_VECTORS),w=e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS),S=c>0,L=s||!!t.get("OES_texture_float"),b=S&&L,R=s?e.getParameter(e.MAX_SAMPLES):0;return{isWebGL2:s,getMaxAnisotropy:n,getMaxPrecision:a,precision:o,logarithmicDepthBuffer:l,maxTextures:f,maxVertexTextures:c,maxTextureSize:h,maxCubemapSize:p,maxAttributes:v,maxVertexUniforms:_,maxVaryings:M,maxFragmentUniforms:w,vertexTextures:S,floatFragmentTextures:L,floatVertexTextures:b,maxSamples:R}}function Uo(){var e=this,t=null,i=0,r=!1,n=!1,a=new ot,s=new je,o={value:null,needsUpdate:!1};this.uniform=o,this.numPlanes=0,this.numIntersection=0,this.init=function(f,c,h){var p=f.length!==0||c||i!==0||r;return r=c,t=l(f,h,0),i=f.length,p},this.beginShadows=function(){n=!0,l(null)},this.endShadows=function(){n=!1,u()},this.setState=function(f,c,h,p,v,_){if(!r||f===null||f.length===0||n&&!h)n?l(null):u();else{var M=n?0:i,w=M*4,S=v.clippingState||null;o.value=S,S=l(f,p,w,_);for(var L=0;L!==w;++L)S[L]=t[L];v.clippingState=S,this.numIntersection=c?this.numPlanes:0,this.numPlanes+=M}};function u(){o.value!==t&&(o.value=t,o.needsUpdate=i>0),e.numPlanes=i,e.numIntersection=0}function l(f,c,h,p){var v=f!==null?f.length:0,_=null;if(v!==0){if(_=o.value,p!==!0||_===null){var M=h+v*4,w=c.matrixWorldInverse;s.getNormalMatrix(w),(_===null||_.length<M)&&(_=new Float32Array(M));for(var S=0,L=h;S!==v;++S,L+=4)a.copy(f[S]).applyMatrix4(w,s),a.normal.toArray(_,L),_[L+3]=a.constant}o.value=_,o.needsUpdate=!0}return e.numPlanes=v,_}}function Io(e){var t={};return{get:function(i){if(t[i]!==void 0)return t[i];var r;switch(i){case"WEBGL_depth_texture":r=e.getExtension("WEBGL_depth_texture")||e.getExtension("MOZ_WEBGL_depth_texture")||e.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":r=e.getExtension("EXT_texture_filter_anisotropic")||e.getExtension("MOZ_EXT_texture_filter_anisotropic")||e.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":r=e.getExtension("WEBGL_compressed_texture_s3tc")||e.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||e.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":r=e.getExtension("WEBGL_compressed_texture_pvrtc")||e.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:r=e.getExtension(i)}return r===null&&console.warn("THREE.WebGLRenderer: "+i+" extension not supported."),t[i]=r,r}}}function No(e,t,i){var r={},n={};function a(l){var f=l.target,c=r[f.id];c.index!==null&&t.remove(c.index);for(var h in c.attributes)t.remove(c.attributes[h]);f.removeEventListener("dispose",a),delete r[f.id];var p=n[c.id];p&&(t.remove(p),delete n[c.id]),i.memory.geometries--}function s(l,f){var c=r[f.id];return c||(f.addEventListener("dispose",a),f.isBufferGeometry?c=f:f.isGeometry&&(f._bufferGeometry===void 0&&(f._bufferGeometry=new Ke().setFromObject(l)),c=f._bufferGeometry),r[f.id]=c,i.memory.geometries++,c)}function o(l){var f=l.index,c=l.attributes;f!==null&&t.update(f,e.ELEMENT_ARRAY_BUFFER);for(var h in c)t.update(c[h],e.ARRAY_BUFFER);var p=l.morphAttributes;for(var h in p)for(var v=p[h],_=0,M=v.length;_<M;_++)t.update(v[_],e.ARRAY_BUFFER)}function u(l){var f=n[l.id];if(f)return f;var c=[],h=l.index,p=l.attributes;if(h!==null)for(var v=h.array,_=0,M=v.length;_<M;_+=3){var w=v[_+0],S=v[_+1],L=v[_+2];c.push(w,S,S,L,L,w)}else for(var v=p.position.array,_=0,M=v.length/3-1;_<M;_+=3){var w=_+0,S=_+1,L=_+2;c.push(w,S,S,L,L,w)}return f=new(br(c)>65535?Dt:Ct)(c,1),t.update(f,e.ELEMENT_ARRAY_BUFFER),n[l.id]=f,f}return{get:s,update:o,getWireframeAttribute:u}}function Bo(e,t,i,r){var n;function a(c){n=c}var s,o;function u(c){s=c.type,o=c.bytesPerElement}function l(c,h){e.drawElements(n,h,s,c*o),i.update(h,n)}function f(c,h,p){var v;if(r.isWebGL2)v=e;else{var v=t.get("ANGLE_instanced_arrays");if(v===null){console.error("THREE.WebGLIndexedBufferRenderer: using THREE.InstancedBufferGeometry but hardware does not support extension ANGLE_instanced_arrays.");return}}v[r.isWebGL2?"drawElementsInstanced":"drawElementsInstancedANGLE"](n,p,s,h*o,c.maxInstancedCount),i.update(p,n,c.maxInstancedCount)}this.setMode=a,this.setIndex=u,this.render=l,this.renderInstances=f}function Oo(e){var t={geometries:0,textures:0},i={frame:0,calls:0,triangles:0,points:0,lines:0};function r(a,s,o){switch(o=o||1,i.calls++,s){case e.TRIANGLES:i.triangles+=o*(a/3);break;case e.TRIANGLE_STRIP:case e.TRIANGLE_FAN:i.triangles+=o*(a-2);break;case e.LINES:i.lines+=o*(a/2);break;case e.LINE_STRIP:i.lines+=o*(a-1);break;case e.LINE_LOOP:i.lines+=o*a;break;case e.POINTS:i.points+=o*a;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",s);break}}function n(){i.frame++,i.calls=0,i.triangles=0,i.points=0,i.lines=0}return{memory:t,render:i,programs:null,autoReset:!0,reset:n,update:r}}function zo(e,t){return Math.abs(t[1])-Math.abs(e[1])}function Go(e){var t={},i=new Float32Array(8);function r(n,a,s,o){var u=n.morphTargetInfluences,l=u.length,f=t[a.id];if(f===void 0){f=[];for(var c=0;c<l;c++)f[c]=[c,0];t[a.id]=f}for(var h=s.morphTargets&&a.morphAttributes.position,p=s.morphNormals&&a.morphAttributes.normal,c=0;c<l;c++){var v=f[c];v[1]!==0&&(h&&a.removeAttribute("morphTarget"+c),p&&a.removeAttribute("morphNormal"+c))}for(var c=0;c<l;c++){var v=f[c];v[0]=c,v[1]=u[c]}f.sort(zo);for(var c=0;c<8;c++){var v=f[c];if(v){var _=v[0],M=v[1];if(M){h&&a.addAttribute("morphTarget"+c,h[_]),p&&a.addAttribute("morphNormal"+c,p[_]),i[c]=M;continue}}i[c]=0}o.getUniforms().setValue(e,"morphTargetInfluences",i)}return{update:r}}function Vo(e,t){var i={};function r(a){var s=t.render.frame,o=a.geometry,u=e.get(a,o);return i[u.id]!==s&&(o.isGeometry&&u.updateFromObject(a),e.update(u),i[u.id]=s),u}function n(){i={}}return{update:r,dispose:n}}function wt(e,t,i,r,n,a,s,o,u,l){e=e!==void 0?e:[],t=t!==void 0?t:hr,Ue.call(this,e,t,i,r,n,a,s,o,u,l),this.flipY=!1}wt.prototype=Object.create(Ue.prototype);wt.prototype.constructor=wt;wt.prototype.isCubeTexture=!0;Object.defineProperty(wt.prototype,"images",{get:function(){return this.image},set:function(e){this.image=e}});function Bt(e,t,i,r){Ue.call(this,null),this.image={data:e,width:t,height:i,depth:r},this.magFilter=Ge,this.minFilter=Ge,this.generateMipmaps=!1,this.flipY=!1}Bt.prototype=Object.create(Ue.prototype);Bt.prototype.constructor=Bt;Bt.prototype.isDataTexture3D=!0;var Sr=new Ue,Ho=new Bt,Tr=new wt;function Lr(){this.seq=[],this.map={}}var Xi=[],qi=[],Yi=new Float32Array(16),ji=new Float32Array(9),Zi=new Float32Array(4);function Lt(e,t,i){var r=e[0];if(r<=0||r>0)return e;var n=t*i,a=Xi[n];if(a===void 0&&(a=new Float32Array(n),Xi[n]=a),t!==0){r.toArray(a,0);for(var s=1,o=0;s!==t;++s)o+=i,e[s].toArray(a,o)}return a}function Te(e,t){if(e.length!==t.length)return!1;for(var i=0,r=e.length;i<r;i++)if(e[i]!==t[i])return!1;return!0}function Ie(e,t){for(var i=0,r=t.length;i<r;i++)e[i]=t[i]}function Ar(e,t){var i=qi[t];i===void 0&&(i=new Int32Array(t),qi[t]=i);for(var r=0;r!==t;++r)i[r]=e.allocTextureUnit();return i}function ko(e,t){var i=this.cache;i[0]!==t&&(e.uniform1f(this.addr,t),i[0]=t)}function Wo(e,t){var i=this.cache;i[0]!==t&&(e.uniform1i(this.addr,t),i[0]=t)}function Xo(e,t){var i=this.cache;if(t.x!==void 0)(i[0]!==t.x||i[1]!==t.y)&&(e.uniform2f(this.addr,t.x,t.y),i[0]=t.x,i[1]=t.y);else{if(Te(i,t))return;e.uniform2fv(this.addr,t),Ie(i,t)}}function qo(e,t){var i=this.cache;if(t.x!==void 0)(i[0]!==t.x||i[1]!==t.y||i[2]!==t.z)&&(e.uniform3f(this.addr,t.x,t.y,t.z),i[0]=t.x,i[1]=t.y,i[2]=t.z);else if(t.r!==void 0)(i[0]!==t.r||i[1]!==t.g||i[2]!==t.b)&&(e.uniform3f(this.addr,t.r,t.g,t.b),i[0]=t.r,i[1]=t.g,i[2]=t.b);else{if(Te(i,t))return;e.uniform3fv(this.addr,t),Ie(i,t)}}function Yo(e,t){var i=this.cache;if(t.x!==void 0)(i[0]!==t.x||i[1]!==t.y||i[2]!==t.z||i[3]!==t.w)&&(e.uniform4f(this.addr,t.x,t.y,t.z,t.w),i[0]=t.x,i[1]=t.y,i[2]=t.z,i[3]=t.w);else{if(Te(i,t))return;e.uniform4fv(this.addr,t),Ie(i,t)}}function jo(e,t){var i=this.cache,r=t.elements;if(r===void 0){if(Te(i,t))return;e.uniformMatrix2fv(this.addr,!1,t),Ie(i,t)}else{if(Te(i,r))return;Zi.set(r),e.uniformMatrix2fv(this.addr,!1,Zi),Ie(i,r)}}function Zo(e,t){var i=this.cache,r=t.elements;if(r===void 0){if(Te(i,t))return;e.uniformMatrix3fv(this.addr,!1,t),Ie(i,t)}else{if(Te(i,r))return;ji.set(r),e.uniformMatrix3fv(this.addr,!1,ji),Ie(i,r)}}function Jo(e,t){var i=this.cache,r=t.elements;if(r===void 0){if(Te(i,t))return;e.uniformMatrix4fv(this.addr,!1,t),Ie(i,t)}else{if(Te(i,r))return;Yi.set(r),e.uniformMatrix4fv(this.addr,!1,Yi),Ie(i,r)}}function Qo(e,t,i){var r=this.cache,n=i.allocTextureUnit();r[0]!==n&&(e.uniform1i(this.addr,n),r[0]=n),i.setTexture2D(t||Sr,n)}function Ko(e,t,i){var r=this.cache,n=i.allocTextureUnit();r[0]!==n&&(e.uniform1i(this.addr,n),r[0]=n),i.setTexture3D(t||Ho,n)}function $o(e,t,i){var r=this.cache,n=i.allocTextureUnit();r[0]!==n&&(e.uniform1i(this.addr,n),r[0]=n),i.setTextureCube(t||Tr,n)}function Rr(e,t){var i=this.cache;Te(i,t)||(e.uniform2iv(this.addr,t),Ie(i,t))}function Pr(e,t){var i=this.cache;Te(i,t)||(e.uniform3iv(this.addr,t),Ie(i,t))}function Cr(e,t){var i=this.cache;Te(i,t)||(e.uniform4iv(this.addr,t),Ie(i,t))}function el(e){switch(e){case 5126:return ko;case 35664:return Xo;case 35665:return qo;case 35666:return Yo;case 35674:return jo;case 35675:return Zo;case 35676:return Jo;case 35678:case 36198:return Qo;case 35679:return Ko;case 35680:return $o;case 5124:case 35670:return Wo;case 35667:case 35671:return Rr;case 35668:case 35672:return Pr;case 35669:case 35673:return Cr}}function tl(e,t){var i=this.cache;Te(i,t)||(e.uniform1fv(this.addr,t),Ie(i,t))}function il(e,t){var i=this.cache;Te(i,t)||(e.uniform1iv(this.addr,t),Ie(i,t))}function rl(e,t){var i=this.cache,r=Lt(t,this.size,2);Te(i,r)||(e.uniform2fv(this.addr,r),this.updateCache(r))}function nl(e,t){var i=this.cache,r=Lt(t,this.size,3);Te(i,r)||(e.uniform3fv(this.addr,r),this.updateCache(r))}function al(e,t){var i=this.cache,r=Lt(t,this.size,4);Te(i,r)||(e.uniform4fv(this.addr,r),this.updateCache(r))}function sl(e,t){var i=this.cache,r=Lt(t,this.size,4);Te(i,r)||(e.uniformMatrix2fv(this.addr,!1,r),this.updateCache(r))}function ol(e,t){var i=this.cache,r=Lt(t,this.size,9);Te(i,r)||(e.uniformMatrix3fv(this.addr,!1,r),this.updateCache(r))}function ll(e,t){var i=this.cache,r=Lt(t,this.size,16);Te(i,r)||(e.uniformMatrix4fv(this.addr,!1,r),this.updateCache(r))}function ul(e,t,i){var r=this.cache,n=t.length,a=Ar(i,n);Te(r,a)===!1&&(e.uniform1iv(this.addr,a),Ie(r,a));for(var s=0;s!==n;++s)i.setTexture2D(t[s]||Sr,a[s])}function fl(e,t,i){var r=this.cache,n=t.length,a=Ar(i,n);Te(r,a)===!1&&(e.uniform1iv(this.addr,a),Ie(r,a));for(var s=0;s!==n;++s)i.setTextureCube(t[s]||Tr,a[s])}function cl(e){switch(e){case 5126:return tl;case 35664:return rl;case 35665:return nl;case 35666:return al;case 35674:return sl;case 35675:return ol;case 35676:return ll;case 35678:return ul;case 35680:return fl;case 5124:case 35670:return il;case 35667:case 35671:return Rr;case 35668:case 35672:return Pr;case 35669:case 35673:return Cr}}function hl(e,t,i){this.id=e,this.addr=i,this.cache=[],this.setValue=el(t.type)}function Dr(e,t,i){this.id=e,this.addr=i,this.cache=[],this.size=t.size,this.setValue=cl(t.type)}Dr.prototype.updateCache=function(e){var t=this.cache;e instanceof Float32Array&&t.length!==e.length&&(this.cache=new Float32Array(e.length)),Ie(t,e)};function Fr(e){this.id=e,Lr.call(this)}Fr.prototype.setValue=function(e,t,i){for(var r=this.seq,n=0,a=r.length;n!==a;++n){var s=r[n];s.setValue(e,t[s.id],i)}};var si=/([\w\d_]+)(\])?(\[|\.)?/g;function Ji(e,t){e.seq.push(t),e.map[t.id]=t}function dl(e,t,i){var r=e.name,n=r.length;for(si.lastIndex=0;;){var a=si.exec(r),s=si.lastIndex,o=a[1],u=a[2]==="]",l=a[3];if(u&&(o=o|0),l===void 0||l==="["&&s+2===n){Ji(i,l===void 0?new hl(o,e,t):new Dr(o,e,t));break}else{var f=i.map,c=f[o];c===void 0&&(c=new Fr(o),Ji(i,c)),i=c}}}function ut(e,t,i){Lr.call(this),this.renderer=i;for(var r=e.getProgramParameter(t,e.ACTIVE_UNIFORMS),n=0;n<r;++n){var a=e.getActiveUniform(t,n),s=e.getUniformLocation(t,a.name);dl(a,s,this)}}ut.prototype.setValue=function(e,t,i){var r=this.map[t];r!==void 0&&r.setValue(e,i,this.renderer)};ut.prototype.setOptional=function(e,t,i){var r=t[i];r!==void 0&&this.setValue(e,i,r)};ut.upload=function(e,t,i,r){for(var n=0,a=t.length;n!==a;++n){var s=t[n],o=i[s.id];o.needsUpdate!==!1&&s.setValue(e,o.value,r)}};ut.seqWithValue=function(e,t){for(var i=[],r=0,n=e.length;r!==n;++r){var a=e[r];a.id in t&&i.push(a)}return i};function pl(e){for(var t=e.split(`
`),i=0;i<t.length;i++)t[i]=i+1+": "+t[i];return t.join(`
`)}function Qi(e,t,i){var r=e.createShader(t);return e.shaderSource(r,i),e.compileShader(r),e.getShaderParameter(r,e.COMPILE_STATUS)===!1&&console.error("THREE.WebGLShader: Shader couldn't compile."),e.getShaderInfoLog(r)!==""&&console.warn("THREE.WebGLShader: gl.getShaderInfoLog()",t===e.VERTEX_SHADER?"vertex":"fragment",e.getShaderInfoLog(r),pl(i)),r}var ml=0;function Ur(e){switch(e){case qt:return["Linear","( value )"];case na:return["sRGB","( value )"];case aa:return["RGBE","( value )"];case sa:return["RGBM","( value, 7.0 )"];case oa:return["RGBM","( value, 16.0 )"];case la:return["RGBD","( value, 256.0 )"];case yr:return["Gamma","( value, float( GAMMA_FACTOR ) )"];default:throw new Error("unsupported encoding: "+e)}}function kt(e,t){var i=Ur(t);return"vec4 "+e+"( vec4 value ) { return "+i[0]+"ToLinear"+i[1]+"; }"}function vl(e,t){var i=Ur(t);return"vec4 "+e+"( vec4 value ) { return LinearTo"+i[0]+i[1]+"; }"}function gl(e,t){var i;switch(t){case fr:i="Linear";break;case bn:i="Reinhard";break;case Sn:i="Uncharted2";break;case Tn:i="OptimizedCineon";break;case Ln:i="ACESFilmic";break;default:throw new Error("unsupported toneMapping: "+t)}return"vec3 "+e+"( vec3 color ) { return "+i+"ToneMapping( color ); }"}function _l(e,t,i){e=e||{};var r=[e.derivatives||t.envMapCubeUV||t.bumpMap||t.normalMap&&!t.objectSpaceNormalMap||t.flatShading?"#extension GL_OES_standard_derivatives : enable":"",(e.fragDepth||t.logarithmicDepthBuffer)&&i.get("EXT_frag_depth")?"#extension GL_EXT_frag_depth : enable":"",e.drawBuffers&&i.get("WEBGL_draw_buffers")?"#extension GL_EXT_draw_buffers : require":"",(e.shaderTextureLOD||t.envMap)&&i.get("EXT_shader_texture_lod")?"#extension GL_EXT_shader_texture_lod : enable":""];return r.filter(At).join(`
`)}function xl(e){var t=[];for(var i in e){var r=e[i];r!==!1&&t.push("#define "+i+" "+r)}return t.join(`
`)}function yl(e,t){for(var i={},r=e.getProgramParameter(t,e.ACTIVE_ATTRIBUTES),n=0;n<r;n++){var a=e.getActiveAttrib(t,n),s=a.name;i[s]=e.getAttribLocation(t,s)}return i}function At(e){return e!==""}function Ki(e,t){return e.replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights)}function $i(e,t){return e.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}function bi(e){var t=/^[ \t]*#include +<([\w\d./]+)>/gm;function i(r,n){var a=ue[n];if(a===void 0)throw new Error("Can not resolve #include <"+n+">");return bi(a)}return e.replace(t,i)}function er(e){var t=/#pragma unroll_loop[\s]+?for \( int i \= (\d+)\; i < (\d+)\; i \+\+ \) \{([\s\S]+?)(?=\})\}/g;function i(r,n,a,s){for(var o="",u=parseInt(n);u<parseInt(a);u++)o+=s.replace(/\[ i \]/g,"[ "+u+" ]");return o}return e.replace(t,i)}function Ml(e,t,i,r,n,a,s){var o=e.context,u=r.defines,l=n.vertexShader,f=n.fragmentShader,c="SHADOWMAP_TYPE_BASIC";a.shadowMapType===ar?c="SHADOWMAP_TYPE_PCF":a.shadowMapType===en&&(c="SHADOWMAP_TYPE_PCF_SOFT");var h="ENVMAP_TYPE_CUBE",p="ENVMAP_MODE_REFLECTION",v="ENVMAP_BLENDING_MULTIPLY";if(a.envMap){switch(r.envMap.mapping){case hr:case Ui:h="ENVMAP_TYPE_CUBE";break;case dr:case pr:h="ENVMAP_TYPE_CUBE_UV";break;case An:case Ii:h="ENVMAP_TYPE_EQUIREC";break;case Rn:h="ENVMAP_TYPE_SPHERE";break}switch(r.envMap.mapping){case Ui:case Ii:p="ENVMAP_MODE_REFRACTION";break}switch(r.combine){case ur:v="ENVMAP_BLENDING_MULTIPLY";break;case En:v="ENVMAP_BLENDING_MIX";break;case wn:v="ENVMAP_BLENDING_ADD";break}}var _=e.gammaFactor>0?e.gammaFactor:1,M=s.isWebGL2?"":_l(r.extensions,a,t),w=xl(u),S=o.createProgram(),L,b;if(r.isRawShaderMaterial?(L=[w].filter(At).join(`
`),L.length>0&&(L+=`
`),b=[M,w].filter(At).join(`
`),b.length>0&&(b+=`
`)):(L=["precision "+a.precision+" float;","precision "+a.precision+" int;","#define SHADER_NAME "+n.name,w,a.supportsVertexTextures?"#define VERTEX_TEXTURES":"","#define GAMMA_FACTOR "+_,"#define MAX_BONES "+a.maxBones,a.useFog&&a.fog?"#define USE_FOG":"",a.useFog&&a.fogExp?"#define FOG_EXP2":"",a.map?"#define USE_MAP":"",a.envMap?"#define USE_ENVMAP":"",a.envMap?"#define "+p:"",a.lightMap?"#define USE_LIGHTMAP":"",a.aoMap?"#define USE_AOMAP":"",a.emissiveMap?"#define USE_EMISSIVEMAP":"",a.bumpMap?"#define USE_BUMPMAP":"",a.normalMap?"#define USE_NORMALMAP":"",a.normalMap&&a.objectSpaceNormalMap?"#define OBJECTSPACE_NORMALMAP":"",a.displacementMap&&a.supportsVertexTextures?"#define USE_DISPLACEMENTMAP":"",a.specularMap?"#define USE_SPECULARMAP":"",a.roughnessMap?"#define USE_ROUGHNESSMAP":"",a.metalnessMap?"#define USE_METALNESSMAP":"",a.alphaMap?"#define USE_ALPHAMAP":"",a.vertexColors?"#define USE_COLOR":"",a.flatShading?"#define FLAT_SHADED":"",a.skinning?"#define USE_SKINNING":"",a.useVertexTexture?"#define BONE_TEXTURE":"",a.morphTargets?"#define USE_MORPHTARGETS":"",a.morphNormals&&a.flatShading===!1?"#define USE_MORPHNORMALS":"",a.doubleSided?"#define DOUBLE_SIDED":"",a.flipSided?"#define FLIP_SIDED":"",a.shadowMapEnabled?"#define USE_SHADOWMAP":"",a.shadowMapEnabled?"#define "+c:"",a.sizeAttenuation?"#define USE_SIZEATTENUATION":"",a.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",a.logarithmicDepthBuffer&&(s.isWebGL2||t.get("EXT_frag_depth"))?"#define USE_LOGDEPTHBUF_EXT":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_COLOR","	attribute vec3 color;","#endif","#ifdef USE_MORPHTARGETS","	attribute vec3 morphTarget0;","	attribute vec3 morphTarget1;","	attribute vec3 morphTarget2;","	attribute vec3 morphTarget3;","	#ifdef USE_MORPHNORMALS","		attribute vec3 morphNormal0;","		attribute vec3 morphNormal1;","		attribute vec3 morphNormal2;","		attribute vec3 morphNormal3;","	#else","		attribute vec3 morphTarget4;","		attribute vec3 morphTarget5;","		attribute vec3 morphTarget6;","		attribute vec3 morphTarget7;","	#endif","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(At).join(`
`),b=[M,"precision "+a.precision+" float;","precision "+a.precision+" int;","#define SHADER_NAME "+n.name,w,a.alphaTest?"#define ALPHATEST "+a.alphaTest+(a.alphaTest%1?"":".0"):"","#define GAMMA_FACTOR "+_,a.useFog&&a.fog?"#define USE_FOG":"",a.useFog&&a.fogExp?"#define FOG_EXP2":"",a.map?"#define USE_MAP":"",a.matcap?"#define USE_MATCAP":"",a.envMap?"#define USE_ENVMAP":"",a.envMap?"#define "+h:"",a.envMap?"#define "+p:"",a.envMap?"#define "+v:"",a.lightMap?"#define USE_LIGHTMAP":"",a.aoMap?"#define USE_AOMAP":"",a.emissiveMap?"#define USE_EMISSIVEMAP":"",a.bumpMap?"#define USE_BUMPMAP":"",a.normalMap?"#define USE_NORMALMAP":"",a.normalMap&&a.objectSpaceNormalMap?"#define OBJECTSPACE_NORMALMAP":"",a.specularMap?"#define USE_SPECULARMAP":"",a.roughnessMap?"#define USE_ROUGHNESSMAP":"",a.metalnessMap?"#define USE_METALNESSMAP":"",a.alphaMap?"#define USE_ALPHAMAP":"",a.vertexColors?"#define USE_COLOR":"",a.gradientMap?"#define USE_GRADIENTMAP":"",a.flatShading?"#define FLAT_SHADED":"",a.doubleSided?"#define DOUBLE_SIDED":"",a.flipSided?"#define FLIP_SIDED":"",a.shadowMapEnabled?"#define USE_SHADOWMAP":"",a.shadowMapEnabled?"#define "+c:"",a.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",a.physicallyCorrectLights?"#define PHYSICALLY_CORRECT_LIGHTS":"",a.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",a.logarithmicDepthBuffer&&(s.isWebGL2||t.get("EXT_frag_depth"))?"#define USE_LOGDEPTHBUF_EXT":"",a.envMap&&(s.isWebGL2||t.get("EXT_shader_texture_lod"))?"#define TEXTURE_LOD_EXT":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;",a.toneMapping!==ai?"#define TONE_MAPPING":"",a.toneMapping!==ai?ue.tonemapping_pars_fragment:"",a.toneMapping!==ai?gl("toneMapping",a.toneMapping):"",a.dithering?"#define DITHERING":"",a.outputEncoding||a.mapEncoding||a.matcapEncoding||a.envMapEncoding||a.emissiveMapEncoding?ue.encodings_pars_fragment:"",a.mapEncoding?kt("mapTexelToLinear",a.mapEncoding):"",a.matcapEncoding?kt("matcapTexelToLinear",a.matcapEncoding):"",a.envMapEncoding?kt("envMapTexelToLinear",a.envMapEncoding):"",a.emissiveMapEncoding?kt("emissiveMapTexelToLinear",a.emissiveMapEncoding):"",a.outputEncoding?vl("linearToOutputTexel",a.outputEncoding):"",a.depthPacking?"#define DEPTH_PACKING "+r.depthPacking:"",`
`].filter(At).join(`
`)),l=bi(l),l=Ki(l,a),l=$i(l,a),f=bi(f),f=Ki(f,a),f=$i(f,a),l=er(l),f=er(f),s.isWebGL2&&!r.isRawShaderMaterial){var R=!1,P=/^\s*#version\s+300\s+es\s*\n/;r.isShaderMaterial&&l.match(P)!==null&&f.match(P)!==null&&(R=!0,l=l.replace(P,""),f=f.replace(P,"")),L=[`#version 300 es
`,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+L,b=[`#version 300 es
`,"#define varying in",R?"":"out highp vec4 pc_fragColor;",R?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+b}var U=L+l,D=b+f,A=Qi(o,o.VERTEX_SHADER,U),F=Qi(o,o.FRAGMENT_SHADER,D);o.attachShader(S,A),o.attachShader(S,F),r.index0AttributeName!==void 0?o.bindAttribLocation(S,0,r.index0AttributeName):a.morphTargets===!0&&o.bindAttribLocation(S,0,"position"),o.linkProgram(S);var N=o.getProgramInfoLog(S).trim(),H=o.getShaderInfoLog(A).trim(),z=o.getShaderInfoLog(F).trim(),k=!0,q=!0;o.getProgramParameter(S,o.LINK_STATUS)===!1?(k=!1,console.error("THREE.WebGLProgram: shader error: ",o.getError(),"gl.VALIDATE_STATUS",o.getProgramParameter(S,o.VALIDATE_STATUS),"gl.getProgramInfoLog",N,H,z)):N!==""?console.warn("THREE.WebGLProgram: gl.getProgramInfoLog()",N):(H===""||z==="")&&(q=!1),q&&(this.diagnostics={runnable:k,material:r,programLog:N,vertexShader:{log:H,prefix:L},fragmentShader:{log:z,prefix:b}}),o.deleteShader(A),o.deleteShader(F);var Q;this.getUniforms=function(){return Q===void 0&&(Q=new ut(o,S,e)),Q};var K;return this.getAttributes=function(){return K===void 0&&(K=yl(o,S)),K},this.destroy=function(){o.deleteProgram(S),this.program=void 0},Object.defineProperties(this,{uniforms:{get:function(){return console.warn("THREE.WebGLProgram: .uniforms is now .getUniforms()."),this.getUniforms()}},attributes:{get:function(){return console.warn("THREE.WebGLProgram: .attributes is now .getAttributes()."),this.getAttributes()}}}),this.name=n.name,this.id=ml++,this.code=i,this.usedTimes=1,this.program=S,this.vertexShader=A,this.fragmentShader=F,this}function El(e,t,i){var r=[],n={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"phong",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"},a=["precision","supportsVertexTextures","map","mapEncoding","matcap","matcapEncoding","envMap","envMapMode","envMapEncoding","lightMap","aoMap","emissiveMap","emissiveMapEncoding","bumpMap","normalMap","objectSpaceNormalMap","displacementMap","specularMap","roughnessMap","metalnessMap","gradientMap","alphaMap","combine","vertexColors","fog","useFog","fogExp","flatShading","sizeAttenuation","logarithmicDepthBuffer","skinning","maxBones","useVertexTexture","morphTargets","morphNormals","maxMorphTargets","maxMorphNormals","premultipliedAlpha","numDirLights","numPointLights","numSpotLights","numHemiLights","numRectAreaLights","shadowMapEnabled","shadowMapType","toneMapping","physicallyCorrectLights","alphaTest","doubleSided","flipSided","numClippingPlanes","numClipIntersection","depthPacking","dithering"];function s(u){var l=u.skeleton,f=l.bones;if(i.floatVertexTextures)return 1024;var c=i.maxVertexUniforms,h=Math.floor((c-20)/4),p=Math.min(h,f.length);return p<f.length?(console.warn("THREE.WebGLRenderer: Skeleton has "+f.length+" bones. This GPU supports "+p+"."),0):p}function o(u,l){var f;return u?u.isTexture?f=u.encoding:u.isWebGLRenderTarget&&(console.warn("THREE.WebGLPrograms.getTextureEncodingFromMap: don't use render targets as textures. Use their .texture property instead."),f=u.texture.encoding):f=qt,f===qt&&l&&(f=yr),f}this.getParameters=function(u,l,f,c,h,p,v){var _=n[u.type],M=v.isSkinnedMesh?s(v):0,w=i.precision;u.precision!==null&&(w=i.getMaxPrecision(u.precision),w!==u.precision&&console.warn("THREE.WebGLProgram.getParameters:",u.precision,"not supported, using",w,"instead."));var S=e.getRenderTarget(),L={shaderID:_,precision:w,supportsVertexTextures:i.vertexTextures,outputEncoding:o(S?S.texture:null,e.gammaOutput),map:!!u.map,mapEncoding:o(u.map,e.gammaInput),matcap:!!u.matcap,matcapEncoding:o(u.matcap,e.gammaInput),envMap:!!u.envMap,envMapMode:u.envMap&&u.envMap.mapping,envMapEncoding:o(u.envMap,e.gammaInput),envMapCubeUV:!!u.envMap&&(u.envMap.mapping===dr||u.envMap.mapping===pr),lightMap:!!u.lightMap,aoMap:!!u.aoMap,emissiveMap:!!u.emissiveMap,emissiveMapEncoding:o(u.emissiveMap,e.gammaInput),bumpMap:!!u.bumpMap,normalMap:!!u.normalMap,objectSpaceNormalMap:u.normalMapType===ca,displacementMap:!!u.displacementMap,roughnessMap:!!u.roughnessMap,metalnessMap:!!u.metalnessMap,specularMap:!!u.specularMap,alphaMap:!!u.alphaMap,gradientMap:!!u.gradientMap,combine:u.combine,vertexColors:u.vertexColors,fog:!!c,useFog:u.fog,fogExp:c&&c.isFogExp2,flatShading:u.flatShading,sizeAttenuation:u.sizeAttenuation,logarithmicDepthBuffer:i.logarithmicDepthBuffer,skinning:u.skinning&&M>0,maxBones:M,useVertexTexture:i.floatVertexTextures,morphTargets:u.morphTargets,morphNormals:u.morphNormals,maxMorphTargets:e.maxMorphTargets,maxMorphNormals:e.maxMorphNormals,numDirLights:l.directional.length,numPointLights:l.point.length,numSpotLights:l.spot.length,numRectAreaLights:l.rectArea.length,numHemiLights:l.hemi.length,numClippingPlanes:h,numClipIntersection:p,dithering:u.dithering,shadowMapEnabled:e.shadowMap.enabled&&v.receiveShadow&&f.length>0,shadowMapType:e.shadowMap.type,toneMapping:e.toneMapping,physicallyCorrectLights:e.physicallyCorrectLights,premultipliedAlpha:u.premultipliedAlpha,alphaTest:u.alphaTest,doubleSided:u.side===Kt,flipSided:u.side===We,depthPacking:u.depthPacking!==void 0?u.depthPacking:!1};return L},this.getProgramCode=function(u,l){var f=[];if(l.shaderID?f.push(l.shaderID):(f.push(u.fragmentShader),f.push(u.vertexShader)),u.defines!==void 0)for(var c in u.defines)f.push(c),f.push(u.defines[c]);for(var h=0;h<a.length;h++)f.push(l[a[h]]);return f.push(u.onBeforeCompile.toString()),f.push(e.gammaOutput),f.push(e.gammaFactor),f.join()},this.acquireProgram=function(u,l,f,c){for(var h,p=0,v=r.length;p<v;p++){var _=r[p];if(_.code===c){h=_,++h.usedTimes;break}}return h===void 0&&(h=new Ml(e,t,c,u,l,f,i),r.push(h)),h},this.releaseProgram=function(u){if(--u.usedTimes===0){var l=r.indexOf(u);r[l]=r[r.length-1],r.pop(),u.destroy()}},this.programs=r}function wl(){var e=new WeakMap;function t(a){var s=e.get(a);return s===void 0&&(s={},e.set(a,s)),s}function i(a){e.delete(a)}function r(a,s,o){e.get(a)[s]=o}function n(){e=new WeakMap}return{get:t,remove:i,update:r,dispose:n}}function bl(e,t){return e.groupOrder!==t.groupOrder?e.groupOrder-t.groupOrder:e.renderOrder!==t.renderOrder?e.renderOrder-t.renderOrder:e.program&&t.program&&e.program!==t.program?e.program.id-t.program.id:e.material.id!==t.material.id?e.material.id-t.material.id:e.z!==t.z?e.z-t.z:e.id-t.id}function Sl(e,t){return e.groupOrder!==t.groupOrder?e.groupOrder-t.groupOrder:e.renderOrder!==t.renderOrder?e.renderOrder-t.renderOrder:e.z!==t.z?t.z-e.z:e.id-t.id}function tr(){var e=[],t=0,i=[],r=[];function n(){t=0,i.length=0,r.length=0}function a(l,f,c,h,p,v){var _=e[t];return _===void 0?(_={id:l.id,object:l,geometry:f,material:c,program:c.program,groupOrder:h,renderOrder:l.renderOrder,z:p,group:v},e[t]=_):(_.id=l.id,_.object=l,_.geometry=f,_.material=c,_.program=c.program,_.groupOrder=h,_.renderOrder=l.renderOrder,_.z=p,_.group=v),t++,_}function s(l,f,c,h,p,v){var _=a(l,f,c,h,p,v);(c.transparent===!0?r:i).push(_)}function o(l,f,c,h,p,v){var _=a(l,f,c,h,p,v);(c.transparent===!0?r:i).unshift(_)}function u(){i.length>1&&i.sort(bl),r.length>1&&r.sort(Sl)}return{opaque:i,transparent:r,init:n,push:s,unshift:o,sort:u}}function Tl(){var e={};function t(n){var a=n.target;a.removeEventListener("dispose",t),delete e[a.id]}function i(n,a){var s=e[n.id],o;return s===void 0?(o=new tr,e[n.id]={},e[n.id][a.id]=o,n.addEventListener("dispose",t)):(o=s[a.id],o===void 0&&(o=new tr,s[a.id]=o)),o}function r(){e={}}return{get:i,dispose:r}}function Ll(){var e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];var i;switch(t.type){case"DirectionalLight":i={direction:new T,color:new Ae,shadow:!1,shadowBias:0,shadowRadius:1,shadowMapSize:new de};break;case"SpotLight":i={position:new T,direction:new T,color:new Ae,distance:0,coneCos:0,penumbraCos:0,decay:0,shadow:!1,shadowBias:0,shadowRadius:1,shadowMapSize:new de};break;case"PointLight":i={position:new T,color:new Ae,distance:0,decay:0,shadow:!1,shadowBias:0,shadowRadius:1,shadowMapSize:new de,shadowCameraNear:1,shadowCameraFar:1e3};break;case"HemisphereLight":i={direction:new T,skyColor:new Ae,groundColor:new Ae};break;case"RectAreaLight":i={color:new Ae,position:new T,halfWidth:new T,halfHeight:new T};break}return e[t.id]=i,i}}}var Al=0;function Rl(){var e=new Ll,t={id:Al++,hash:{stateID:-1,directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,shadowsLength:-1},ambient:[0,0,0],directional:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotShadowMap:[],spotShadowMatrix:[],rectArea:[],point:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[]},i=new T,r=new pe,n=new pe;function a(s,o,u){for(var l=0,f=0,c=0,h=0,p=0,v=0,_=0,M=0,w=u.matrixWorldInverse,S=0,L=s.length;S<L;S++){var b=s[S],R=b.color,P=b.intensity,U=b.distance,D=b.shadow&&b.shadow.map?b.shadow.map.texture:null;if(b.isAmbientLight)l+=R.r*P,f+=R.g*P,c+=R.b*P;else if(b.isDirectionalLight){var A=e.get(b);if(A.color.copy(b.color).multiplyScalar(b.intensity),A.direction.setFromMatrixPosition(b.matrixWorld),i.setFromMatrixPosition(b.target.matrixWorld),A.direction.sub(i),A.direction.transformDirection(w),A.shadow=b.castShadow,b.castShadow){var F=b.shadow;A.shadowBias=F.bias,A.shadowRadius=F.radius,A.shadowMapSize=F.mapSize}t.directionalShadowMap[h]=D,t.directionalShadowMatrix[h]=b.shadow.matrix,t.directional[h]=A,h++}else if(b.isSpotLight){var A=e.get(b);if(A.position.setFromMatrixPosition(b.matrixWorld),A.position.applyMatrix4(w),A.color.copy(R).multiplyScalar(P),A.distance=U,A.direction.setFromMatrixPosition(b.matrixWorld),i.setFromMatrixPosition(b.target.matrixWorld),A.direction.sub(i),A.direction.transformDirection(w),A.coneCos=Math.cos(b.angle),A.penumbraCos=Math.cos(b.angle*(1-b.penumbra)),A.decay=b.decay,A.shadow=b.castShadow,b.castShadow){var F=b.shadow;A.shadowBias=F.bias,A.shadowRadius=F.radius,A.shadowMapSize=F.mapSize}t.spotShadowMap[v]=D,t.spotShadowMatrix[v]=b.shadow.matrix,t.spot[v]=A,v++}else if(b.isRectAreaLight){var A=e.get(b);A.color.copy(R).multiplyScalar(P),A.position.setFromMatrixPosition(b.matrixWorld),A.position.applyMatrix4(w),n.identity(),r.copy(b.matrixWorld),r.premultiply(w),n.extractRotation(r),A.halfWidth.set(b.width*.5,0,0),A.halfHeight.set(0,b.height*.5,0),A.halfWidth.applyMatrix4(n),A.halfHeight.applyMatrix4(n),t.rectArea[_]=A,_++}else if(b.isPointLight){var A=e.get(b);if(A.position.setFromMatrixPosition(b.matrixWorld),A.position.applyMatrix4(w),A.color.copy(b.color).multiplyScalar(b.intensity),A.distance=b.distance,A.decay=b.decay,A.shadow=b.castShadow,b.castShadow){var F=b.shadow;A.shadowBias=F.bias,A.shadowRadius=F.radius,A.shadowMapSize=F.mapSize,A.shadowCameraNear=F.camera.near,A.shadowCameraFar=F.camera.far}t.pointShadowMap[p]=D,t.pointShadowMatrix[p]=b.shadow.matrix,t.point[p]=A,p++}else if(b.isHemisphereLight){var A=e.get(b);A.direction.setFromMatrixPosition(b.matrixWorld),A.direction.transformDirection(w),A.direction.normalize(),A.skyColor.copy(b.color).multiplyScalar(P),A.groundColor.copy(b.groundColor).multiplyScalar(P),t.hemi[M]=A,M++}}t.ambient[0]=l,t.ambient[1]=f,t.ambient[2]=c,t.directional.length=h,t.spot.length=v,t.rectArea.length=_,t.point.length=p,t.hemi.length=M,t.hash.stateID=t.id,t.hash.directionalLength=h,t.hash.pointLength=p,t.hash.spotLength=v,t.hash.rectAreaLength=_,t.hash.hemiLength=M,t.hash.shadowsLength=o.length}return{setup:a,state:t}}function ir(){var e=new Rl,t=[],i=[];function r(){t.length=0,i.length=0}function n(u){t.push(u)}function a(u){i.push(u)}function s(u){e.setup(t,i,u)}var o={lightsArray:t,shadowsArray:i,lights:e};return{init:r,state:o,setupLights:s,pushLight:n,pushShadow:a}}function Pl(){var e={};function t(n){var a=n.target;a.removeEventListener("dispose",t),delete e[a.id]}function i(n,a){var s;return e[n.id]===void 0?(s=new ir,e[n.id]={},e[n.id][a.id]=s,n.addEventListener("dispose",t)):e[n.id][a.id]===void 0?(s=new ir,e[n.id][a.id]=s):s=e[n.id][a.id],s}function r(){e={}}return{get:i,dispose:r}}function bt(e){ze.call(this),this.type="MeshDepthMaterial",this.depthPacking=ua,this.skinning=!1,this.morphTargets=!1,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.setValues(e)}bt.prototype=Object.create(ze.prototype);bt.prototype.constructor=bt;bt.prototype.isMeshDepthMaterial=!0;bt.prototype.copy=function(e){return ze.prototype.copy.call(this,e),this.depthPacking=e.depthPacking,this.skinning=e.skinning,this.morphTargets=e.morphTargets,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this};function St(e){ze.call(this),this.type="MeshDistanceMaterial",this.referencePosition=new T,this.nearDistance=1,this.farDistance=1e3,this.skinning=!1,this.morphTargets=!1,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.fog=!1,this.lights=!1,this.setValues(e)}St.prototype=Object.create(ze.prototype);St.prototype.constructor=St;St.prototype.isMeshDistanceMaterial=!0;St.prototype.copy=function(e){return ze.prototype.copy.call(this,e),this.referencePosition.copy(e.referencePosition),this.nearDistance=e.nearDistance,this.farDistance=e.farDistance,this.skinning=e.skinning,this.morphTargets=e.morphTargets,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this};function Cl(e,t,i){for(var r=new Ti,n=new pe,a=new de,s=new de(i,i),o=new T,u=new T,l=1,f=2,c=(l|f)+1,h=new Array(c),p=new Array(c),v={},_={0:We,1:Qt,2:Kt},M=[new T(1,0,0),new T(-1,0,0),new T(0,0,1),new T(0,0,-1),new T(0,1,0),new T(0,-1,0)],w=[new T(0,1,0),new T(0,1,0),new T(0,1,0),new T(0,1,0),new T(0,0,1),new T(0,0,-1)],S=[new Me,new Me,new Me,new Me,new Me,new Me],L=0;L!==c;++L){var b=(L&l)!==0,R=(L&f)!==0,P=new bt({depthPacking:fa,morphTargets:b,skinning:R});h[L]=P;var U=new St({morphTargets:b,skinning:R});p[L]=U}var D=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=ar,this.render=function(N,H,z){if(D.enabled!==!1&&!(D.autoUpdate===!1&&D.needsUpdate===!1)&&N.length!==0){var k=e.state;k.setBlending(Wt),k.buffers.color.setClear(1,1,1,1),k.buffers.depth.setTest(!0),k.setScissorTest(!1);for(var q,Q=0,K=N.length;Q<K;Q++){var X=N[Q],g=X.shadow,x=X&&X.isPointLight;if(g===void 0){console.warn("THREE.WebGLShadowMap:",X,"has no shadow.");continue}var I=g.camera;if(a.copy(g.mapSize),a.min(s),x){var E=a.x,J=a.y;S[0].set(E*2,J,E,J),S[1].set(0,J,E,J),S[2].set(E*3,J,E,J),S[3].set(E,J,E,J),S[4].set(E*3,0,E,J),S[5].set(E,0,E,J),a.x*=4,a.y*=2}if(g.map===null){var O={minFilter:Ge,magFilter:Ge,format:ft};g.map=new jt(a.x,a.y,O),g.map.texture.name=X.name+".shadowMap",I.updateProjectionMatrix()}g.isSpotLightShadow&&g.update(X);var G=g.map,V=g.matrix;u.setFromMatrixPosition(X.matrixWorld),I.position.copy(u),x?(q=6,V.makeTranslation(-u.x,-u.y,-u.z)):(q=1,o.setFromMatrixPosition(X.target.matrixWorld),I.lookAt(o),I.updateMatrixWorld(),V.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),V.multiply(I.projectionMatrix),V.multiply(I.matrixWorldInverse)),e.setRenderTarget(G),e.clear();for(var re=0;re<q;re++){if(x){o.copy(I.position),o.add(M[re]),I.up.copy(w[re]),I.lookAt(o),I.updateMatrixWorld();var te=S[re];k.viewport(te)}n.multiplyMatrices(I.projectionMatrix,I.matrixWorldInverse),r.setFromMatrix(n),F(H,z,I,x)}}D.needsUpdate=!1}};function A(N,H,z,k,q,Q){var K=N.geometry,X=null,g=h,x=N.customDepthMaterial;if(z&&(g=p,x=N.customDistanceMaterial),x)X=x;else{var I=!1;H.morphTargets&&(K&&K.isBufferGeometry?I=K.morphAttributes&&K.morphAttributes.position&&K.morphAttributes.position.length>0:K&&K.isGeometry&&(I=K.morphTargets&&K.morphTargets.length>0)),N.isSkinnedMesh&&H.skinning===!1&&console.warn("THREE.WebGLShadowMap: THREE.SkinnedMesh with material.skinning set to false:",N);var E=N.isSkinnedMesh&&H.skinning,J=0;I&&(J|=l),E&&(J|=f),X=g[J]}if(e.localClippingEnabled&&H.clipShadows===!0&&H.clippingPlanes.length!==0){var O=X.uuid,G=H.uuid,V=v[O];V===void 0&&(V={},v[O]=V);var re=V[G];re===void 0&&(re=X.clone(),V[G]=re),X=re}return X.visible=H.visible,X.wireframe=H.wireframe,X.side=H.shadowSide!=null?H.shadowSide:_[H.side],X.clipShadows=H.clipShadows,X.clippingPlanes=H.clippingPlanes,X.clipIntersection=H.clipIntersection,X.wireframeLinewidth=H.wireframeLinewidth,X.linewidth=H.linewidth,z&&X.isMeshDistanceMaterial&&(X.referencePosition.copy(k),X.nearDistance=q,X.farDistance=Q),X}function F(N,H,z,k){if(N.visible!==!1){var q=N.layers.test(H.layers);if(q&&(N.isMesh||N.isLine||N.isPoints)&&N.castShadow&&(!N.frustumCulled||r.intersectsObject(N))){N.modelViewMatrix.multiplyMatrices(z.matrixWorldInverse,N.matrixWorld);var Q=t.update(N),K=N.material;if(Array.isArray(K))for(var X=Q.groups,g=0,x=X.length;g<x;g++){var I=X[g],E=K[I.materialIndex];if(E&&E.visible){var J=A(N,E,k,u,z.near,z.far);e.renderBufferDirect(z,null,Q,J,N,I)}}else if(K.visible){var J=A(N,K,k,u,z.near,z.far);e.renderBufferDirect(z,null,Q,J,N,null)}}for(var O=N.children,G=0,V=O.length;G<V;G++)F(O[G],H,z,k)}}}function Dl(e,t,i,r){function n(){var C=!1,ne=new Me,ae=null,be=new Me(0,0,0,0);return{setMask:function(ie){ae!==ie&&!C&&(e.colorMask(ie,ie,ie,ie),ae=ie)},setLocked:function(ie){C=ie},setClear:function(ie,Se,Ne,Ce,st){st===!0&&(ie*=Ce,Se*=Ce,Ne*=Ce),ne.set(ie,Se,Ne,Ce),be.equals(ne)===!1&&(e.clearColor(ie,Se,Ne,Ce),be.copy(ne))},reset:function(){C=!1,ae=null,be.set(-1,0,0,0)}}}function a(){var C=!1,ne=null,ae=null,be=null;return{setTest:function(ie){ie?ee(e.DEPTH_TEST):ce(e.DEPTH_TEST)},setMask:function(ie){ne!==ie&&!C&&(e.depthMask(ie),ne=ie)},setFunc:function(ie){if(ae!==ie){if(ie)switch(ie){case mn:e.depthFunc(e.NEVER);break;case vn:e.depthFunc(e.ALWAYS);break;case gn:e.depthFunc(e.LESS);break;case oi:e.depthFunc(e.LEQUAL);break;case _n:e.depthFunc(e.EQUAL);break;case xn:e.depthFunc(e.GEQUAL);break;case yn:e.depthFunc(e.GREATER);break;case Mn:e.depthFunc(e.NOTEQUAL);break;default:e.depthFunc(e.LEQUAL)}else e.depthFunc(e.LEQUAL);ae=ie}},setLocked:function(ie){C=ie},setClear:function(ie){be!==ie&&(e.clearDepth(ie),be=ie)},reset:function(){C=!1,ne=null,ae=null,be=null}}}function s(){var C=!1,ne=null,ae=null,be=null,ie=null,Se=null,Ne=null,Ce=null,st=null;return{setTest:function(Ee){Ee?ee(e.STENCIL_TEST):ce(e.STENCIL_TEST)},setMask:function(Ee){ne!==Ee&&!C&&(e.stencilMask(Ee),ne=Ee)},setFunc:function(Ee,Ze,Be){(ae!==Ee||be!==Ze||ie!==Be)&&(e.stencilFunc(Ee,Ze,Be),ae=Ee,be=Ze,ie=Be)},setOp:function(Ee,Ze,Be){(Se!==Ee||Ne!==Ze||Ce!==Be)&&(e.stencilOp(Ee,Ze,Be),Se=Ee,Ne=Ze,Ce=Be)},setLocked:function(Ee){C=Ee},setClear:function(Ee){st!==Ee&&(e.clearStencil(Ee),st=Ee)},reset:function(){C=!1,ne=null,ae=null,be=null,ie=null,Se=null,Ne=null,Ce=null,st=null}}}var o=new n,u=new a,l=new s,f=e.getParameter(e.MAX_VERTEX_ATTRIBS),c=new Uint8Array(f),h=new Uint8Array(f),p=new Uint8Array(f),v={},_=null,M=null,w=null,S=null,L=null,b=null,R=null,P=null,U=null,D=null,A=!1,F=null,N=null,H=null,z=null,k=null,q=e.getParameter(e.MAX_COMBINED_TEXTURE_IMAGE_UNITS),Q=!1,K=0,X=e.getParameter(e.VERSION);X.indexOf("WebGL")!==-1?(K=parseFloat(/^WebGL\ ([0-9])/.exec(X)[1]),Q=K>=1):X.indexOf("OpenGL ES")!==-1&&(K=parseFloat(/^OpenGL\ ES\ ([0-9])/.exec(X)[1]),Q=K>=2);var g=null,x={},I=new Me,E=new Me;function J(C,ne,ae){var be=new Uint8Array(4),ie=e.createTexture();e.bindTexture(C,ie),e.texParameteri(C,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(C,e.TEXTURE_MAG_FILTER,e.NEAREST);for(var Se=0;Se<ae;Se++)e.texImage2D(ne+Se,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,be);return ie}var O={};O[e.TEXTURE_2D]=J(e.TEXTURE_2D,e.TEXTURE_2D,1),O[e.TEXTURE_CUBE_MAP]=J(e.TEXTURE_CUBE_MAP,e.TEXTURE_CUBE_MAP_POSITIVE_X,6),o.setClear(0,0,0,1),u.setClear(1),l.setClear(0),ee(e.DEPTH_TEST),u.setFunc(oi),Ve(!1),He(Pi),ee(e.CULL_FACE),ge(Wt);function G(){for(var C=0,ne=c.length;C<ne;C++)c[C]=0}function V(C){re(C,0)}function re(C,ne){if(c[C]=1,h[C]===0&&(e.enableVertexAttribArray(C),h[C]=1),p[C]!==ne){var ae=r.isWebGL2?e:t.get("ANGLE_instanced_arrays");ae[r.isWebGL2?"vertexAttribDivisor":"vertexAttribDivisorANGLE"](C,ne),p[C]=ne}}function te(){for(var C=0,ne=h.length;C!==ne;++C)h[C]!==c[C]&&(e.disableVertexAttribArray(C),h[C]=0)}function ee(C){v[C]!==!0&&(e.enable(C),v[C]=!0)}function ce(C){v[C]!==!1&&(e.disable(C),v[C]=!1)}function le(){if(_===null&&(_=[],t.get("WEBGL_compressed_texture_pvrtc")||t.get("WEBGL_compressed_texture_s3tc")||t.get("WEBGL_compressed_texture_etc1")||t.get("WEBGL_compressed_texture_astc")))for(var C=e.getParameter(e.COMPRESSED_TEXTURE_FORMATS),ne=0;ne<C.length;ne++)_.push(C[ne]);return _}function Re(C){return M!==C?(e.useProgram(C),M=C,!0):!1}function ge(C,ne,ae,be,ie,Se,Ne,Ce){if(C===Wt){w&&(ce(e.BLEND),w=!1);return}if(w||(ee(e.BLEND),w=!0),C!==rn){if(C!==S||Ce!==A){if((L!==_t||P!==_t)&&(e.blendEquation(e.FUNC_ADD),L=_t,P=_t),Ce)switch(C){case Rt:e.blendFuncSeparate(e.ONE,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case Ci:e.blendFunc(e.ONE,e.ONE);break;case Di:e.blendFuncSeparate(e.ZERO,e.ZERO,e.ONE_MINUS_SRC_COLOR,e.ONE_MINUS_SRC_ALPHA);break;case Fi:e.blendFuncSeparate(e.ZERO,e.SRC_COLOR,e.ZERO,e.SRC_ALPHA);break;default:console.error("THREE.WebGLState: Invalid blending: ",C);break}else switch(C){case Rt:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case Ci:e.blendFunc(e.SRC_ALPHA,e.ONE);break;case Di:e.blendFunc(e.ZERO,e.ONE_MINUS_SRC_COLOR);break;case Fi:e.blendFunc(e.ZERO,e.SRC_COLOR);break;default:console.error("THREE.WebGLState: Invalid blending: ",C);break}b=null,R=null,U=null,D=null,S=C,A=Ce}return}ie=ie||ne,Se=Se||ae,Ne=Ne||be,(ne!==L||ie!==P)&&(e.blendEquationSeparate(i.convert(ne),i.convert(ie)),L=ne,P=ie),(ae!==b||be!==R||Se!==U||Ne!==D)&&(e.blendFuncSeparate(i.convert(ae),i.convert(be),i.convert(Se),i.convert(Ne)),b=ae,R=be,U=Se,D=Ne),S=C,A=null}function qe(C,ne){C.side===Kt?ce(e.CULL_FACE):ee(e.CULL_FACE);var ae=C.side===We;ne&&(ae=!ae),Ve(ae),C.blending===Rt&&C.transparent===!1?ge(Wt):ge(C.blending,C.blendEquation,C.blendSrc,C.blendDst,C.blendEquationAlpha,C.blendSrcAlpha,C.blendDstAlpha,C.premultipliedAlpha),u.setFunc(C.depthFunc),u.setTest(C.depthTest),u.setMask(C.depthWrite),o.setMask(C.colorWrite),dt(C.polygonOffset,C.polygonOffsetFactor,C.polygonOffsetUnits)}function Ve(C){F!==C&&(C?e.frontFace(e.CW):e.frontFace(e.CCW),F=C)}function He(C){C!==Kr?(ee(e.CULL_FACE),C!==N&&(C===Pi?e.cullFace(e.BACK):C===$r?e.cullFace(e.FRONT):e.cullFace(e.FRONT_AND_BACK))):ce(e.CULL_FACE),N=C}function $e(C){C!==H&&(Q&&e.lineWidth(C),H=C)}function dt(C,ne,ae){C?(ee(e.POLYGON_OFFSET_FILL),(z!==ne||k!==ae)&&(e.polygonOffset(ne,ae),z=ne,k=ae)):ce(e.POLYGON_OFFSET_FILL)}function et(C){C?ee(e.SCISSOR_TEST):ce(e.SCISSOR_TEST)}function Fe(C){C===void 0&&(C=e.TEXTURE0+q-1),g!==C&&(e.activeTexture(C),g=C)}function at(C,ne){g===null&&Fe();var ae=x[g];ae===void 0&&(ae={type:void 0,texture:void 0},x[g]=ae),(ae.type!==C||ae.texture!==ne)&&(e.bindTexture(C,ne||O[C]),ae.type=C,ae.texture=ne)}function Ye(){try{e.compressedTexImage2D.apply(e,arguments)}catch(C){console.error("THREE.WebGLState:",C)}}function Ot(){try{e.texImage2D.apply(e,arguments)}catch(C){console.error("THREE.WebGLState:",C)}}function zt(){try{e.texImage3D.apply(e,arguments)}catch(C){console.error("THREE.WebGLState:",C)}}function Gt(C){I.equals(C)===!1&&(e.scissor(C.x,C.y,C.z,C.w),I.copy(C))}function Vt(C){E.equals(C)===!1&&(e.viewport(C.x,C.y,C.z,C.w),E.copy(C))}function ei(){for(var C=0;C<h.length;C++)h[C]===1&&(e.disableVertexAttribArray(C),h[C]=0);v={},_=null,g=null,x={},M=null,S=null,F=null,N=null,o.reset(),u.reset(),l.reset()}return{buffers:{color:o,depth:u,stencil:l},initAttributes:G,enableAttribute:V,enableAttributeAndDivisor:re,disableUnusedAttributes:te,enable:ee,disable:ce,getCompressedTextureFormats:le,useProgram:Re,setBlending:ge,setMaterial:qe,setFlipSided:Ve,setCullFace:He,setLineWidth:$e,setPolygonOffset:dt,setScissorTest:et,activeTexture:Fe,bindTexture:at,compressedTexImage2D:Ye,texImage2D:Ot,texImage3D:zt,scissor:Gt,viewport:Vt,reset:ei}}function Fl(e,t,i,r,n,a,s){var o={},u;function l(g,x,I,E){var J=1;if((g.width>E||g.height>E)&&(J=E/Math.max(g.width,g.height)),J<1||x===!0)if(g instanceof HTMLImageElement||g instanceof HTMLCanvasElement||g instanceof ImageBitmap){u===void 0&&(u=document.createElementNS("http://www.w3.org/1999/xhtml","canvas"));var O=I?document.createElementNS("http://www.w3.org/1999/xhtml","canvas"):u,G=x?xe.floorPowerOfTwo:Math.floor;O.width=G(J*g.width),O.height=G(J*g.height);var V=O.getContext("2d");return V.drawImage(g,0,0,O.width,O.height),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+g.width+"x"+g.height+") to ("+O.width+"x"+O.height+")."),O}else return"data"in g&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+g.width+"x"+g.height+")."),g;return g}function f(g){return xe.isPowerOfTwo(g.width)&&xe.isPowerOfTwo(g.height)}function c(g){return n.isWebGL2?!1:g.wrapS!==rt||g.wrapT!==rt||g.minFilter!==Ge&&g.minFilter!==pt}function h(g,x){return g.generateMipmaps&&x&&g.minFilter!==Ge&&g.minFilter!==pt}function p(g,x,I,E){e.generateMipmap(g);var J=r.get(x);J.__maxMipLevel=Math.log(Math.max(I,E))*Math.LOG2E}function v(g,x){if(!n.isWebGL2)return g;var I=g;return g===e.RED&&(x===e.FLOAT&&(I=e.R32F),x===e.HALF_FLOAT&&(I=e.R16F),x===e.UNSIGNED_BYTE&&(I=e.R8)),g===e.RGB&&(x===e.FLOAT&&(I=e.RGB32F),x===e.HALF_FLOAT&&(I=e.RGB16F),x===e.UNSIGNED_BYTE&&(I=e.RGB8)),g===e.RGBA&&(x===e.FLOAT&&(I=e.RGBA32F),x===e.HALF_FLOAT&&(I=e.RGBA16F),x===e.UNSIGNED_BYTE&&(I=e.RGBA8)),I===e.R16F||I===e.R32F||I===e.RGBA16F||I===e.RGBA32F?t.get("EXT_color_buffer_float"):(I===e.RGB16F||I===e.RGB32F)&&console.warn("THREE.WebGLRenderer: Floating point textures with RGB format not supported. Please use RGBA instead."),I}function _(g){return g===Ge||g===mr||g===vr?e.NEAREST:e.LINEAR}function M(g){var x=g.target;x.removeEventListener("dispose",M),S(x),x.isVideoTexture&&delete o[x.id],s.memory.textures--}function w(g){var x=g.target;x.removeEventListener("dispose",w),L(x),s.memory.textures--}function S(g){var x=r.get(g);if(g.image&&x.__image__webglTextureCube)e.deleteTexture(x.__image__webglTextureCube);else{if(x.__webglInit===void 0)return;e.deleteTexture(x.__webglTexture)}r.remove(g)}function L(g){var x=r.get(g),I=r.get(g.texture);if(g){if(I.__webglTexture!==void 0&&e.deleteTexture(I.__webglTexture),g.depthTexture&&g.depthTexture.dispose(),g.isWebGLRenderTargetCube)for(var E=0;E<6;E++)e.deleteFramebuffer(x.__webglFramebuffer[E]),x.__webglDepthbuffer&&e.deleteRenderbuffer(x.__webglDepthbuffer[E]);else e.deleteFramebuffer(x.__webglFramebuffer),x.__webglDepthbuffer&&e.deleteRenderbuffer(x.__webglDepthbuffer);r.remove(g.texture),r.remove(g)}}function b(g,x){var I=r.get(g);if(g.isVideoTexture&&X(g),g.version>0&&I.__version!==g.version){var E=g.image;if(E===void 0)console.warn("THREE.WebGLRenderer: Texture marked for update but image is undefined");else if(E.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{A(I,g,x);return}}i.activeTexture(e.TEXTURE0+x),i.bindTexture(e.TEXTURE_2D,I.__webglTexture)}function R(g,x){var I=r.get(g);if(g.version>0&&I.__version!==g.version){A(I,g,x);return}i.activeTexture(e.TEXTURE0+x),i.bindTexture(e.TEXTURE_3D,I.__webglTexture)}function P(g,x){var I=r.get(g);if(g.image.length===6)if(g.version>0&&I.__version!==g.version){I.__image__webglTextureCube||(g.addEventListener("dispose",M),I.__image__webglTextureCube=e.createTexture(),s.memory.textures++),i.activeTexture(e.TEXTURE0+x),i.bindTexture(e.TEXTURE_CUBE_MAP,I.__image__webglTextureCube),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,g.flipY);for(var E=g&&g.isCompressedTexture,J=g.image[0]&&g.image[0].isDataTexture,O=[],G=0;G<6;G++)!E&&!J?O[G]=l(g.image[G],!1,!0,n.maxCubemapSize):O[G]=J?g.image[G].image:g.image[G];var V=O[0],re=f(V),te=a.convert(g.format),ee=a.convert(g.type),ce=v(te,ee);D(e.TEXTURE_CUBE_MAP,g,re);for(var G=0;G<6;G++)if(!E)J?i.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+G,0,ce,O[G].width,O[G].height,0,te,ee,O[G].data):i.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+G,0,ce,te,ee,O[G]);else for(var le,Re=O[G].mipmaps,ge=0,qe=Re.length;ge<qe;ge++)le=Re[ge],g.format!==ft&&g.format!==Xt?i.getCompressedTextureFormats().indexOf(te)>-1?i.compressedTexImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+G,ge,ce,le.width,le.height,0,le.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):i.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+G,ge,ce,le.width,le.height,0,te,ee,le.data);E?I.__maxMipLevel=Re.length-1:I.__maxMipLevel=0,h(g,re)&&p(e.TEXTURE_CUBE_MAP,g,V.width,V.height),I.__version=g.version,g.onUpdate&&g.onUpdate(g)}else i.activeTexture(e.TEXTURE0+x),i.bindTexture(e.TEXTURE_CUBE_MAP,I.__image__webglTextureCube)}function U(g,x){i.activeTexture(e.TEXTURE0+x),i.bindTexture(e.TEXTURE_CUBE_MAP,r.get(g).__webglTexture)}function D(g,x,I){var E;if(I?(e.texParameteri(g,e.TEXTURE_WRAP_S,a.convert(x.wrapS)),e.texParameteri(g,e.TEXTURE_WRAP_T,a.convert(x.wrapT)),e.texParameteri(g,e.TEXTURE_MAG_FILTER,a.convert(x.magFilter)),e.texParameteri(g,e.TEXTURE_MIN_FILTER,a.convert(x.minFilter))):(e.texParameteri(g,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(g,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),(x.wrapS!==rt||x.wrapT!==rt)&&console.warn("THREE.WebGLRenderer: Texture is not power of two. Texture.wrapS and Texture.wrapT should be set to THREE.ClampToEdgeWrapping."),e.texParameteri(g,e.TEXTURE_MAG_FILTER,_(x.magFilter)),e.texParameteri(g,e.TEXTURE_MIN_FILTER,_(x.minFilter)),x.minFilter!==Ge&&x.minFilter!==pt&&console.warn("THREE.WebGLRenderer: Texture is not power of two. Texture.minFilter should be set to THREE.NearestFilter or THREE.LinearFilter.")),E=t.get("EXT_texture_filter_anisotropic"),E){if(x.type===Pt&&t.get("OES_texture_float_linear")===null||x.type===Si&&(n.isWebGL2||t.get("OES_texture_half_float_linear"))===null)return;(x.anisotropy>1||r.get(x).__currentAnisotropy)&&(e.texParameterf(g,E.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(x.anisotropy,n.getMaxAnisotropy())),r.get(x).__currentAnisotropy=x.anisotropy)}}function A(g,x,I){var E;x.isDataTexture3D?E=e.TEXTURE_3D:E=e.TEXTURE_2D,g.__webglInit===void 0&&(g.__webglInit=!0,x.addEventListener("dispose",M),g.__webglTexture=e.createTexture(),s.memory.textures++),i.activeTexture(e.TEXTURE0+I),i.bindTexture(E,g.__webglTexture),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,x.flipY),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),e.pixelStorei(e.UNPACK_ALIGNMENT,x.unpackAlignment);var J=c(x)&&f(x.image)===!1,O=l(x.image,J,!1,n.maxTextureSize),G=f(O),V=a.convert(x.format),re=a.convert(x.type),te=v(V,re);D(E,x,G);var ee,ce=x.mipmaps;if(x.isDepthTexture){if(te=e.DEPTH_COMPONENT,x.type===Pt){if(!n.isWebGL2)throw new Error("Float Depth Texture only supported in WebGL2.0");te=e.DEPTH_COMPONENT32F}else n.isWebGL2&&(te=e.DEPTH_COMPONENT16);x.format===hi&&te===e.DEPTH_COMPONENT&&x.type!==fi&&x.type!==_r&&(console.warn("THREE.WebGLRenderer: Use UnsignedShortType or UnsignedIntType for DepthFormat DepthTexture."),x.type=fi,re=a.convert(x.type)),x.format===di&&(te=e.DEPTH_STENCIL,x.type!==ci&&(console.warn("THREE.WebGLRenderer: Use UnsignedInt248Type for DepthStencilFormat DepthTexture."),x.type=ci,re=a.convert(x.type))),i.texImage2D(e.TEXTURE_2D,0,te,O.width,O.height,0,V,re,null)}else if(x.isDataTexture){if(ce.length>0&&G){for(var le=0,Re=ce.length;le<Re;le++)ee=ce[le],i.texImage2D(e.TEXTURE_2D,le,te,ee.width,ee.height,0,V,re,ee.data);x.generateMipmaps=!1,g.__maxMipLevel=ce.length-1}else i.texImage2D(e.TEXTURE_2D,0,te,O.width,O.height,0,V,re,O.data),g.__maxMipLevel=0;x.isCfxTexture&&(e.texParameterf(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameterf(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.MIRRORED_REPEAT),e.texParameterf(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.REPEAT))}else if(x.isCompressedTexture){for(var le=0,Re=ce.length;le<Re;le++)ee=ce[le],x.format!==ft&&x.format!==Xt?i.getCompressedTextureFormats().indexOf(V)>-1?i.compressedTexImage2D(e.TEXTURE_2D,le,te,ee.width,ee.height,0,ee.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):i.texImage2D(e.TEXTURE_2D,le,te,ee.width,ee.height,0,V,re,ee.data);g.__maxMipLevel=ce.length-1}else if(x.isDataTexture3D)i.texImage3D(e.TEXTURE_3D,0,te,O.width,O.height,O.depth,0,V,re,O.data),g.__maxMipLevel=0;else if(ce.length>0&&G){for(var le=0,Re=ce.length;le<Re;le++)ee=ce[le],i.texImage2D(e.TEXTURE_2D,le,te,V,re,ee);x.generateMipmaps=!1,g.__maxMipLevel=ce.length-1}else i.texImage2D(e.TEXTURE_2D,0,te,V,re,O),g.__maxMipLevel=0;h(x,G)&&p(e.TEXTURE_2D,x,O.width,O.height),g.__version=x.version,x.onUpdate&&x.onUpdate(x)}function F(g,x,I,E){var J=a.convert(x.texture.format),O=a.convert(x.texture.type),G=v(J,O);i.texImage2D(E,0,G,x.width,x.height,0,J,O,null),e.bindFramebuffer(e.FRAMEBUFFER,g),e.framebufferTexture2D(e.FRAMEBUFFER,I,E,r.get(x.texture).__webglTexture,0),e.bindFramebuffer(e.FRAMEBUFFER,null)}function N(g,x,I){if(e.bindRenderbuffer(e.RENDERBUFFER,g),x.depthBuffer&&!x.stencilBuffer){if(I){var E=K(x);e.renderbufferStorageMultisample(e.RENDERBUFFER,E,e.DEPTH_COMPONENT16,x.width,x.height)}else e.renderbufferStorage(e.RENDERBUFFER,e.DEPTH_COMPONENT16,x.width,x.height);e.framebufferRenderbuffer(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.RENDERBUFFER,g)}else if(x.depthBuffer&&x.stencilBuffer){if(I){var E=K(x);e.renderbufferStorageMultisample(e.RENDERBUFFER,E,e.DEPTH_STENCIL,x.width,x.height)}else e.renderbufferStorage(e.RENDERBUFFER,e.DEPTH_STENCIL,x.width,x.height);e.framebufferRenderbuffer(e.FRAMEBUFFER,e.DEPTH_STENCIL_ATTACHMENT,e.RENDERBUFFER,g)}else{var J=a.convert(x.texture.format),O=a.convert(x.texture.type),G=v(J,O);if(I){var E=K(x);e.renderbufferStorageMultisample(e.RENDERBUFFER,E,G,x.width,x.height)}else e.renderbufferStorage(e.RENDERBUFFER,G,x.width,x.height)}e.bindRenderbuffer(e.RENDERBUFFER,null)}function H(g,x){var I=x&&x.isWebGLRenderTargetCube;if(I)throw new Error("Depth Texture with cube render targets is not supported");if(e.bindFramebuffer(e.FRAMEBUFFER,g),!(x.depthTexture&&x.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");(!r.get(x.depthTexture).__webglTexture||x.depthTexture.image.width!==x.width||x.depthTexture.image.height!==x.height)&&(x.depthTexture.image.width=x.width,x.depthTexture.image.height=x.height,x.depthTexture.needsUpdate=!0),b(x.depthTexture,0);var E=r.get(x.depthTexture).__webglTexture;if(x.depthTexture.format===hi)e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,E,0);else if(x.depthTexture.format===di)e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_STENCIL_ATTACHMENT,e.TEXTURE_2D,E,0);else throw new Error("Unknown depthTexture format")}function z(g){var x=r.get(g),I=g.isWebGLRenderTargetCube===!0;if(g.depthTexture){if(I)throw new Error("target.depthTexture not supported in Cube render targets");H(x.__webglFramebuffer,g)}else if(I){x.__webglDepthbuffer=[];for(var E=0;E<6;E++)e.bindFramebuffer(e.FRAMEBUFFER,x.__webglFramebuffer[E]),x.__webglDepthbuffer[E]=e.createRenderbuffer(),N(x.__webglDepthbuffer[E],g)}else e.bindFramebuffer(e.FRAMEBUFFER,x.__webglFramebuffer),x.__webglDepthbuffer=e.createRenderbuffer(),N(x.__webglDepthbuffer,g);e.bindFramebuffer(e.FRAMEBUFFER,null)}function k(g){var x=r.get(g),I=r.get(g.texture);g.addEventListener("dispose",w),I.__webglTexture=e.createTexture(),s.memory.textures++;var E=g.isWebGLRenderTargetCube===!0,J=g.isWebGLMultisampleRenderTarget===!0,O=f(g);if(E){x.__webglFramebuffer=[];for(var G=0;G<6;G++)x.__webglFramebuffer[G]=e.createFramebuffer()}else if(x.__webglFramebuffer=e.createFramebuffer(),J)if(n.isWebGL2){x.__webglMultisampledFramebuffer=e.createFramebuffer(),x.__webglColorRenderbuffer=e.createRenderbuffer(),e.bindRenderbuffer(e.RENDERBUFFER,x.__webglColorRenderbuffer);var V=a.convert(g.texture.format),re=a.convert(g.texture.type),te=v(V,re),ee=K(g);e.renderbufferStorageMultisample(e.RENDERBUFFER,ee,te,g.width,g.height),e.bindFramebuffer(e.FRAMEBUFFER,x.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.RENDERBUFFER,x.__webglColorRenderbuffer),e.bindRenderbuffer(e.RENDERBUFFER,null),g.depthBuffer&&(x.__webglDepthRenderbuffer=e.createRenderbuffer(),N(x.__webglDepthRenderbuffer,g,!0)),e.bindFramebuffer(e.FRAMEBUFFER,null)}else console.warn("THREE.WebGLRenderer: WebGLMultisampleRenderTarget can only be used with WebGL2.");if(E){i.bindTexture(e.TEXTURE_CUBE_MAP,I.__webglTexture),D(e.TEXTURE_CUBE_MAP,g.texture,O);for(var G=0;G<6;G++)F(x.__webglFramebuffer[G],g,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+G);h(g.texture,O)&&p(e.TEXTURE_CUBE_MAP,g.texture,g.width,g.height),i.bindTexture(e.TEXTURE_CUBE_MAP,null)}else i.bindTexture(e.TEXTURE_2D,I.__webglTexture),D(e.TEXTURE_2D,g.texture,O),F(x.__webglFramebuffer,g,e.COLOR_ATTACHMENT0,e.TEXTURE_2D),h(g.texture,O)&&p(e.TEXTURE_2D,g.texture,g.width,g.height),i.bindTexture(e.TEXTURE_2D,null);g.depthBuffer&&z(g)}function q(g){var x=g.texture,I=f(g);if(h(x,I)){var E=g.isWebGLRenderTargetCube?e.TEXTURE_CUBE_MAP:e.TEXTURE_2D,J=r.get(x).__webglTexture;i.bindTexture(E,J),p(E,x,g.width,g.height),i.bindTexture(E,null)}}function Q(g){if(g.isWebGLMultisampleRenderTarget)if(n.isWebGL2){var x=r.get(g);e.bindFramebuffer(e.READ_FRAMEBUFFER,x.__webglMultisampledFramebuffer),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,x.__webglFramebuffer);var I=g.width,E=g.height,J=e.COLOR_BUFFER_BIT;g.depthBuffer&&(J|=e.DEPTH_BUFFER_BIT),g.stencilBuffer&&(J|=e.STENCIL_BUFFER_BIT),e.blitFramebuffer(0,0,I,E,0,0,I,E,J,e.NEAREST)}else console.warn("THREE.WebGLRenderer: WebGLMultisampleRenderTarget can only be used with WebGL2.")}function K(g){return n.isWebGL2&&g.isWebGLMultisampleRenderTarget?Math.min(n.maxSamples,g.samples):0}function X(g){var x=g.id,I=s.render.frame;o[x]!==I&&(o[x]=I,g.update())}this.setTexture2D=b,this.setTexture3D=R,this.setTextureCube=P,this.setTextureCubeDynamic=U,this.setupRenderTarget=k,this.updateRenderTargetMipmap=q,this.updateMultisampleRenderTarget=Q}function Ul(e,t,i){function r(n){var a;if(n===li)return e.REPEAT;if(n===rt)return e.CLAMP_TO_EDGE;if(n===ui)return e.MIRRORED_REPEAT;if(n===Ge)return e.NEAREST;if(n===mr)return e.NEAREST_MIPMAP_NEAREST;if(n===vr)return e.NEAREST_MIPMAP_LINEAR;if(n===pt)return e.LINEAR;if(n===Pn)return e.LINEAR_MIPMAP_NEAREST;if(n===gr)return e.LINEAR_MIPMAP_LINEAR;if(n===$t)return e.UNSIGNED_BYTE;if(n===Un)return e.UNSIGNED_SHORT_4_4_4_4;if(n===In)return e.UNSIGNED_SHORT_5_5_5_1;if(n===Nn)return e.UNSIGNED_SHORT_5_6_5;if(n===Cn)return e.BYTE;if(n===Dn)return e.SHORT;if(n===fi)return e.UNSIGNED_SHORT;if(n===Fn)return e.INT;if(n===_r)return e.UNSIGNED_INT;if(n===Pt)return e.FLOAT;if(n===Si){if(i.isWebGL2)return e.HALF_FLOAT;if(a=t.get("OES_texture_half_float"),a!==null)return a.HALF_FLOAT_OES}if(n===Bn)return e.ALPHA;if(n===Xt)return e.RGB;if(n===ft)return e.RGBA;if(n===On)return e.LUMINANCE;if(n===zn)return e.LUMINANCE_ALPHA;if(n===hi)return e.DEPTH_COMPONENT;if(n===di)return e.DEPTH_STENCIL;if(n===Gn)return e.RED;if(n===_t)return e.FUNC_ADD;if(n===nn)return e.FUNC_SUBTRACT;if(n===an)return e.FUNC_REVERSE_SUBTRACT;if(n===sn)return e.ZERO;if(n===on)return e.ONE;if(n===ln)return e.SRC_COLOR;if(n===un)return e.ONE_MINUS_SRC_COLOR;if(n===or)return e.SRC_ALPHA;if(n===lr)return e.ONE_MINUS_SRC_ALPHA;if(n===fn)return e.DST_ALPHA;if(n===cn)return e.ONE_MINUS_DST_ALPHA;if(n===hn)return e.DST_COLOR;if(n===dn)return e.ONE_MINUS_DST_COLOR;if(n===pn)return e.SRC_ALPHA_SATURATE;if((n===Ni||n===Bi||n===Oi||n===zi)&&(a=t.get("WEBGL_compressed_texture_s3tc"),a!==null)){if(n===Ni)return a.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===Bi)return a.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===Oi)return a.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===zi)return a.COMPRESSED_RGBA_S3TC_DXT5_EXT}if((n===Gi||n===Vi||n===Hi||n===ki)&&(a=t.get("WEBGL_compressed_texture_pvrtc"),a!==null)){if(n===Gi)return a.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===Vi)return a.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===Hi)return a.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===ki)return a.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}if(n===Vn&&(a=t.get("WEBGL_compressed_texture_etc1"),a!==null))return a.COMPRESSED_RGB_ETC1_WEBGL;if((n===Hn||n===kn||n===Wn||n===Xn||n===qn||n===Yn||n===jn||n===Zn||n===Jn||n===Qn||n===Kn||n===$n||n===ea||n===ta)&&(a=t.get("WEBGL_compressed_texture_astc"),a!==null))return n;if(n===ri||n===ni){if(i.isWebGL2){if(n===ri)return e.MIN;if(n===ni)return e.MAX}if(a=t.get("EXT_blend_minmax"),a!==null){if(n===ri)return a.MIN_EXT;if(n===ni)return a.MAX_EXT}}if(n===ci){if(i.isWebGL2)return e.UNSIGNED_INT_24_8;if(a=t.get("WEBGL_depth_texture"),a!==null)return a.UNSIGNED_INT_24_8_WEBGL}return 0}return{convert:r}}function Zt(){we.call(this),this.type="Group"}Zt.prototype=Object.assign(Object.create(we.prototype),{constructor:Zt,isGroup:!0});function ht(e,t,i,r){ct.call(this),this.type="PerspectiveCamera",this.fov=e!==void 0?e:50,this.zoom=1,this.near=i!==void 0?i:.1,this.far=r!==void 0?r:2e3,this.focus=10,this.aspect=t!==void 0?t:1,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}ht.prototype=Object.assign(Object.create(ct.prototype),{constructor:ht,isPerspectiveCamera:!0,copy:function(e,t){return ct.prototype.copy.call(this,e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this},setFocalLength:function(e){var t=.5*this.getFilmHeight()/e;this.fov=xe.RAD2DEG*2*Math.atan(t),this.updateProjectionMatrix()},getFocalLength:function(){var e=Math.tan(xe.DEG2RAD*.5*this.fov);return .5*this.getFilmHeight()/e},getEffectiveFOV:function(){return xe.RAD2DEG*2*Math.atan(Math.tan(xe.DEG2RAD*.5*this.fov)/this.zoom)},getFilmWidth:function(){return this.filmGauge*Math.min(this.aspect,1)},getFilmHeight:function(){return this.filmGauge/Math.max(this.aspect,1)},setViewOffset:function(e,t,i,r,n,a){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=i,this.view.offsetY=r,this.view.width=n,this.view.height=a,this.updateProjectionMatrix()},clearViewOffset:function(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()},updateProjectionMatrix:function(){var e=this.near,t=e*Math.tan(xe.DEG2RAD*.5*this.fov)/this.zoom,i=2*t,r=this.aspect*i,n=-.5*r,a=this.view;if(this.view!==null&&this.view.enabled){var s=a.fullWidth,o=a.fullHeight;n+=a.offsetX*r/s,t-=a.offsetY*i/o,r*=a.width/s,i*=a.height/o}var u=this.filmOffset;u!==0&&(n+=e*u/this.getFilmWidth()),this.projectionMatrix.makePerspective(n,n+r,t,t-i,e,this.far),this.projectionMatrixInverse.getInverse(this.projectionMatrix)},toJSON:function(e){var t=we.prototype.toJSON.call(this,e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}});function Jt(e){ht.call(this),this.cameras=e||[]}Jt.prototype=Object.assign(Object.create(ht.prototype),{constructor:Jt,isArrayCamera:!0});var rr=new T,nr=new T;function Ir(e,t,i){rr.setFromMatrixPosition(t.matrixWorld),nr.setFromMatrixPosition(i.matrixWorld);var r=rr.distanceTo(nr),n=t.projectionMatrix.elements,a=i.projectionMatrix.elements,s=n[14]/(n[10]-1),o=n[14]/(n[10]+1),u=(n[9]+1)/n[5],l=(n[9]-1)/n[5],f=(n[8]-1)/n[0],c=(a[8]+1)/a[0],h=s*f,p=s*c,v=r/(-f+c),_=v*-f;t.matrixWorld.decompose(e.position,e.quaternion,e.scale),e.translateX(_),e.translateZ(v),e.matrixWorld.compose(e.position,e.quaternion,e.scale),e.matrixWorldInverse.getInverse(e.matrixWorld);var M=s+v,w=o+v,S=h-_,L=p+(r-_),b=u*o/w*M,R=l*o/w*M;e.projectionMatrix.makePerspective(S,L,b,R,M,w)}function Il(e){var t=this,i=null,r=null,n=null,a=[],s=new pe,o=new pe,u=1,l="stage";typeof window<"u"&&"VRFrameData"in window&&(r=new window.VRFrameData,window.addEventListener("vrdisplaypresentchange",L,!1));var f=new pe,c=new Xe,h=new T,p=new ht;p.bounds=new Me(0,0,.5,1),p.layers.enable(1);var v=new ht;v.bounds=new Me(.5,0,.5,1),v.layers.enable(2);var _=new Jt([p,v]);_.layers.enable(1),_.layers.enable(2);function M(){return i!==null&&i.isPresenting===!0}var w,S;function L(){if(M()){var D=i.getEyeParameters("left"),A=D.renderWidth*u,F=D.renderHeight*u;S=e.getPixelRatio(),w=e.getSize(),e.setDrawingBufferSize(A*2,F,1),U.start()}else t.enabled&&e.setDrawingBufferSize(w.width,w.height,S),U.stop()}var b=[];function R(D){for(var A=navigator.getGamepads&&navigator.getGamepads(),F=0,N=0,H=A.length;F<H;F++){var z=A[F];if(z&&(z.id==="Daydream Controller"||z.id==="Gear VR Controller"||z.id==="Oculus Go Controller"||z.id==="OpenVR Gamepad"||z.id.startsWith("Oculus Touch")||z.id.startsWith("Spatial Controller"))){if(N===D)return z;N++}}}function P(){for(var D=0;D<a.length;D++){var A=a[D],F=R(D);if(F!==void 0&&F.pose!==void 0){if(F.pose===null)return;var N=F.pose;N.hasPosition===!1&&A.position.set(.2,-.6,-.05),N.position!==null&&A.position.fromArray(N.position),N.orientation!==null&&A.quaternion.fromArray(N.orientation),A.matrix.compose(A.position,A.quaternion,A.scale),A.matrix.premultiply(s),A.matrix.decompose(A.position,A.quaternion,A.scale),A.matrixWorldNeedsUpdate=!0,A.visible=!0;var H=F.id==="Daydream Controller"?0:1;b[D]!==F.buttons[H].pressed&&(b[D]=F.buttons[H].pressed,b[D]===!0?A.dispatchEvent({type:"selectstart"}):(A.dispatchEvent({type:"selectend"}),A.dispatchEvent({type:"select"})))}else A.visible=!1}}this.enabled=!1,this.getController=function(D){var A=a[D];return A===void 0&&(A=new Zt,A.matrixAutoUpdate=!1,A.visible=!1,a[D]=A),A},this.getDevice=function(){return i},this.setDevice=function(D){D!==void 0&&(i=D),U.setContext(D)},this.setFramebufferScaleFactor=function(D){u=D},this.setFrameOfReferenceType=function(D){l=D},this.setPoseTarget=function(D){D!==void 0&&(n=D)},this.getCamera=function(D){var A=l==="stage"?1.6:0;if(i===null)return D.position.set(0,A,0),D;if(i.depthNear=D.near,i.depthFar=D.far,i.getFrameData(r),l==="stage"){var F=i.stageParameters;F?s.fromArray(F.sittingToStandingTransform):s.makeTranslation(0,A,0)}var N=r.pose,H=n!==null?n:D;if(H.matrix.copy(s),H.matrix.decompose(H.position,H.quaternion,H.scale),N.orientation!==null&&(c.fromArray(N.orientation),H.quaternion.multiply(c)),N.position!==null&&(c.setFromRotationMatrix(s),h.fromArray(N.position),h.applyQuaternion(c),H.position.add(h)),H.updateMatrixWorld(),i.isPresenting===!1)return D;p.near=D.near,v.near=D.near,p.far=D.far,v.far=D.far,p.matrixWorldInverse.fromArray(r.leftViewMatrix),v.matrixWorldInverse.fromArray(r.rightViewMatrix),o.getInverse(s),l==="stage"&&(p.matrixWorldInverse.multiply(o),v.matrixWorldInverse.multiply(o));var z=H.parent;z!==null&&(f.getInverse(z.matrixWorld),p.matrixWorldInverse.multiply(f),v.matrixWorldInverse.multiply(f)),p.matrixWorld.getInverse(p.matrixWorldInverse),v.matrixWorld.getInverse(v.matrixWorldInverse),p.projectionMatrix.fromArray(r.leftProjectionMatrix),v.projectionMatrix.fromArray(r.rightProjectionMatrix),Ir(_,p,v);var k=i.getLayers();if(k.length){var q=k[0];q.leftBounds!==null&&q.leftBounds.length===4&&p.bounds.fromArray(q.leftBounds),q.rightBounds!==null&&q.rightBounds.length===4&&v.bounds.fromArray(q.rightBounds)}return P(),_},this.getStandingMatrix=function(){return s},this.isPresenting=M;var U=new Li;this.setAnimationLoop=function(D){U.setAnimationLoop(D)},this.submitFrame=function(){M()&&i.submitFrame()},this.dispose=function(){typeof window<"u"&&window.removeEventListener("vrdisplaypresentchange",L)}}function Nl(e){var t=e.context,i=null,r=null,n=1,a=null,s="stage",o=null,u=[],l=[];function f(){return r!==null&&a!==null}var c=new ht;c.layers.enable(1),c.viewport=new Me;var h=new ht;h.layers.enable(2),h.viewport=new Me;var p=new Jt([c,h]);p.layers.enable(1),p.layers.enable(2),this.enabled=!1,this.getController=function(b){var R=u[b];return R===void 0&&(R=new Zt,R.matrixAutoUpdate=!1,R.visible=!1,u[b]=R),R},this.getDevice=function(){return i},this.setDevice=function(b){b!==void 0&&(i=b),b instanceof XRDevice&&t.setCompatibleXRDevice(b)};function v(b){var R=u[l.indexOf(b.inputSource)];R&&R.dispatchEvent({type:b.type})}function _(){e.setFramebuffer(null),L.stop()}this.setFramebufferScaleFactor=function(b){n=b},this.setFrameOfReferenceType=function(b){s=b},this.setSession=function(b){r=b,r!==null&&(r.addEventListener("select",v),r.addEventListener("selectstart",v),r.addEventListener("selectend",v),r.addEventListener("end",_),r.baseLayer=new XRWebGLLayer(r,t,{framebufferScaleFactor:n}),r.requestFrameOfReference(s).then(function(R){a=R,e.setFramebuffer(r.baseLayer.framebuffer),L.setContext(r),L.start()}),l=r.getInputSources(),r.addEventListener("inputsourceschange",function(){l=r.getInputSources(),console.log(l);for(var R=0;R<u.length;R++){var P=u[R];P.userData.inputSource=l[R]}}))};function M(b,R){R===null?b.matrixWorld.copy(b.matrix):b.matrixWorld.multiplyMatrices(R.matrixWorld,b.matrix),b.matrixWorldInverse.getInverse(b.matrixWorld)}this.getCamera=function(b){if(f()){var R=b.parent,P=p.cameras;M(p,R);for(var U=0;U<P.length;U++)M(P[U],R);b.matrixWorld.copy(p.matrixWorld);for(var D=b.children,U=0,A=D.length;U<A;U++)D[U].updateMatrixWorld(!0);return Ir(p,c,h),p}return b},this.isPresenting=f;var w=null;function S(b,R){if(o=R.getDevicePose(a),o!==null)for(var P=r.baseLayer,U=R.views,D=0;D<U.length;D++){var A=U[D],F=P.getViewport(A),N=o.getViewMatrix(A),H=p.cameras[D];H.matrix.fromArray(N).getInverse(H.matrix),H.projectionMatrix.fromArray(A.projectionMatrix),H.viewport.set(F.x,F.y,F.width,F.height),D===0&&p.matrix.copy(H.matrix)}for(var D=0;D<u.length;D++){var z=u[D],k=l[D];if(k){var q=R.getInputPose(k,a);if(q!==null){"targetRay"in q?z.matrix.elements=q.targetRay.transformMatrix:"pointerMatrix"in q&&(z.matrix.elements=q.pointerMatrix),z.matrix.decompose(z.position,z.rotation,z.scale),z.visible=!0;continue}}z.visible=!1}w&&w(b)}var L=new Li;L.setAnimationLoop(S),this.setAnimationLoop=function(b){w=b},this.dispose=function(){},this.getStandingMatrix=function(){return console.warn("THREE.WebXRManager: getStandingMatrix() is no longer needed."),new THREE.Matrix4},this.submitFrame=function(){}}function Bl(e){e=e||{};var t=e.canvas!==void 0?e.canvas:document.createElementNS("http://www.w3.org/1999/xhtml","canvas"),i=e.context!==void 0?e.context:null,r=e.alpha!==void 0?e.alpha:!1,n=e.depth!==void 0?e.depth:!0,a=e.stencil!==void 0?e.stencil:!0,s=e.antialias!==void 0?e.antialias:!1,o=e.premultipliedAlpha!==void 0?e.premultipliedAlpha:!0,u=e.preserveDrawingBuffer!==void 0?e.preserveDrawingBuffer:!1,l=e.powerPreference!==void 0?e.powerPreference:"default",f=null,c=null;this.domElement=t,this.context=null,this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.gammaFactor=2,this.gammaInput=!1,this.gammaOutput=!1,this.physicallyCorrectLights=!1,this.toneMapping=fr,this.toneMappingExposure=1,this.toneMappingWhitePoint=1,this.maxMorphTargets=8,this.maxMorphNormals=4;var h=this,p=!1,v=null,_=null,M=null,w=-1,S={geometry:null,program:null,wireframe:!1},L=null,b=null,R=new Me,P=new Me,U=null,D=0,A=t.width,F=t.height,N=1,H=new Me(0,0,A,F),z=new Me(0,0,A,F),k=!1,q=new Ti,Q=new Uo,K=!1,X=!1,g=new pe,x=new T;function I(){return _===null?N:1}var E;try{var J={alpha:r,depth:n,stencil:a,antialias:s,premultipliedAlpha:o,preserveDrawingBuffer:u,powerPreference:l};if(t.addEventListener("webglcontextlost",zt,!1),t.addEventListener("webglcontextrestored",Gt,!1),E=i||t.getContext("webgl",J)||t.getContext("experimental-webgl",J),E===null)throw t.getContext("webgl")!==null?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.");E.getShaderPrecisionFormat===void 0&&(E.getShaderPrecisionFormat=function(){return{rangeMin:1,rangeMax:1,precision:1}})}catch(d){console.error("THREE.WebGLRenderer: "+d.message)}var O,G,V,re,te,ee,ce,le,Re,ge,qe,Ve,He,$e,dt,et,Fe;function at(){O=new Io(E),G=new Fo(E,O,e),G.isWebGL2||(O.get("WEBGL_depth_texture"),O.get("OES_texture_float"),O.get("OES_texture_half_float"),O.get("OES_texture_half_float_linear"),O.get("OES_standard_derivatives"),O.get("OES_element_index_uint"),O.get("ANGLE_instanced_arrays")),O.get("OES_texture_float_linear"),Fe=new Ul(E,O,G),V=new Dl(E,O,Fe,G),V.scissor(P.copy(z).multiplyScalar(N)),V.viewport(R.copy(H).multiplyScalar(N)),re=new Oo(E),te=new wl,ee=new Fl(E,O,V,te,G,Fe,re),ce=new Po(E),le=new No(E,ce,re),Re=new Vo(le,re),$e=new Go(E),ge=new El(h,O,G),qe=new Tl,Ve=new Pl,He=new Co(h,V,Re,o),dt=new Do(E,O,re,G),et=new Bo(E,O,re,G),re.programs=ge.programs,h.context=E,h.capabilities=G,h.extensions=O,h.properties=te,h.renderLists=qe,h.state=V,h.info=re}at();var Ye=null;typeof navigator<"u"&&(Ye="xr"in navigator?new Nl(h):new Il(h)),this.vr=Ye;var Ot=new Cl(h,Re,G.maxTextureSize);this.shadowMap=Ot,this.getContext=function(){return E},this.getContextAttributes=function(){return E.getContextAttributes()},this.forceContextLoss=function(){var d=O.get("WEBGL_lose_context");d&&d.loseContext()},this.forceContextRestore=function(){var d=O.get("WEBGL_lose_context");d&&d.restoreContext()},this.getPixelRatio=function(){return N},this.setPixelRatio=function(d){d!==void 0&&(N=d,this.setSize(A,F,!1))},this.getSize=function(){return{width:A,height:F}},this.setSize=function(d,m,y){if(Ye.isPresenting()){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}A=d,F=m,t.width=d*N,t.height=m*N,y!==!1&&(t.style.width=d+"px",t.style.height=m+"px"),this.setViewport(0,0,d,m)},this.getDrawingBufferSize=function(){return{width:A*N,height:F*N}},this.setDrawingBufferSize=function(d,m,y){A=d,F=m,N=y,t.width=d*y,t.height=m*y,this.setViewport(0,0,d,m)},this.getCurrentViewport=function(){return R},this.setViewport=function(d,m,y,B){H.set(d,F-m-B,y,B),V.viewport(R.copy(H).multiplyScalar(N))},this.setScissor=function(d,m,y,B){z.set(d,F-m-B,y,B),V.scissor(P.copy(z).multiplyScalar(N))},this.setScissorTest=function(d){V.setScissorTest(k=d)},this.getClearColor=function(){return He.getClearColor()},this.setClearColor=function(){He.setClearColor.apply(He,arguments)},this.getClearAlpha=function(){return He.getClearAlpha()},this.setClearAlpha=function(){He.setClearAlpha.apply(He,arguments)},this.clear=function(d,m,y){var B=0;(d===void 0||d)&&(B|=E.COLOR_BUFFER_BIT),(m===void 0||m)&&(B|=E.DEPTH_BUFFER_BIT),(y===void 0||y)&&(B|=E.STENCIL_BUFFER_BIT),E.clear(B)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){t.removeEventListener("webglcontextlost",zt,!1),t.removeEventListener("webglcontextrestored",Gt,!1),qe.dispose(),Ve.dispose(),te.dispose(),Re.dispose(),Ye.dispose(),Se.stop()};function zt(d){d.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),p=!0}function Gt(){console.log("THREE.WebGLRenderer: Context Restored."),p=!1,at()}function Vt(d){var m=d.target;m.removeEventListener("dispose",Vt),ei(m)}function ei(d){C(d),te.remove(d)}function C(d){var m=te.get(d).program;d.program=void 0,m!==void 0&&ge.releaseProgram(m)}function ne(d,m){d.render(function(y){h.renderBufferImmediate(y,m)})}this.renderBufferImmediate=function(d,m){V.initAttributes();var y=te.get(d);d.hasPositions&&!y.position&&(y.position=E.createBuffer()),d.hasNormals&&!y.normal&&(y.normal=E.createBuffer()),d.hasUvs&&!y.uv&&(y.uv=E.createBuffer()),d.hasColors&&!y.color&&(y.color=E.createBuffer());var B=m.getAttributes();d.hasPositions&&(E.bindBuffer(E.ARRAY_BUFFER,y.position),E.bufferData(E.ARRAY_BUFFER,d.positionArray,E.DYNAMIC_DRAW),V.enableAttribute(B.position),E.vertexAttribPointer(B.position,3,E.FLOAT,!1,0,0)),d.hasNormals&&(E.bindBuffer(E.ARRAY_BUFFER,y.normal),E.bufferData(E.ARRAY_BUFFER,d.normalArray,E.DYNAMIC_DRAW),V.enableAttribute(B.normal),E.vertexAttribPointer(B.normal,3,E.FLOAT,!1,0,0)),d.hasUvs&&(E.bindBuffer(E.ARRAY_BUFFER,y.uv),E.bufferData(E.ARRAY_BUFFER,d.uvArray,E.DYNAMIC_DRAW),V.enableAttribute(B.uv),E.vertexAttribPointer(B.uv,2,E.FLOAT,!1,0,0)),d.hasColors&&(E.bindBuffer(E.ARRAY_BUFFER,y.color),E.bufferData(E.ARRAY_BUFFER,d.colorArray,E.DYNAMIC_DRAW),V.enableAttribute(B.color),E.vertexAttribPointer(B.color,3,E.FLOAT,!1,0,0)),V.disableUnusedAttributes(),E.drawArrays(E.TRIANGLES,0,d.count),d.count=0},this.renderBufferDirect=function(d,m,y,B,W,fe){var Y=W.isMesh&&W.normalMatrix.determinant()<0;V.setMaterial(B,Y);var j=Ze(d,m,B,W),se=!1;(S.geometry!==y.id||S.program!==j.id||S.wireframe!==(B.wireframe===!0))&&(S.geometry=y.id,S.program=j.id,S.wireframe=B.wireframe===!0,se=!0),W.morphTargetInfluences&&($e.update(W,y,B,j),se=!0);var _e=y.index,me=y.attributes.position,ye=1;B.wireframe===!0&&(_e=le.getWireframeAttribute(y),ye=2);var Le,oe=dt;_e!==null&&(Le=ce.get(_e),oe=et,oe.setIndex(Le)),se&&(ae(B,j,y),_e!==null&&E.bindBuffer(E.ELEMENT_ARRAY_BUFFER,Le.buffer));var $=1/0;_e!==null?$=_e.count:me!==void 0&&($=me.count);var he=y.drawRange.start*ye,De=y.drawRange.count*ye,Je=fe!==null?fe.start*ye:0,Pe=fe!==null?fe.count*ye:1/0,tt=Math.max(he,Je),Ht=Math.min($,he+De,Je+Pe)-1,ti=Math.max(0,Ht-tt+1);if(ti!==0){if(W.isMesh)if(B.wireframe===!0)V.setLineWidth(B.wireframeLinewidth*I()),oe.setMode(E.LINES);else switch(W.drawMode){case xr:oe.setMode(E.TRIANGLES);break;case ia:oe.setMode(E.TRIANGLE_STRIP);break;case ra:oe.setMode(E.TRIANGLE_FAN);break}else if(W.isLine){var ii=B.linewidth;ii===void 0&&(ii=1),V.setLineWidth(ii*I()),W.isLineSegments?oe.setMode(E.LINES):W.isLineLoop?oe.setMode(E.LINE_LOOP):oe.setMode(E.LINE_STRIP)}else W.isPoints?oe.setMode(E.POINTS):W.isSprite&&oe.setMode(E.TRIANGLES);y&&y.isInstancedBufferGeometry?y.maxInstancedCount>0&&oe.renderInstances(y,tt,ti):oe.render(tt,ti)}};function ae(d,m,y){if(y&&y.isInstancedBufferGeometry&!G.isWebGL2&&O.get("ANGLE_instanced_arrays")===null){console.error("THREE.WebGLRenderer.setupVertexAttributes: using THREE.InstancedBufferGeometry but hardware does not support extension ANGLE_instanced_arrays.");return}V.initAttributes();var B=y.attributes,W=m.getAttributes(),fe=d.defaultAttributeValues;for(var Y in W){var j=W[Y];if(j>=0){var se=B[Y];if(se!==void 0){var _e=se.normalized,me=se.itemSize,ye=ce.get(se);if(ye===void 0)continue;var Le=ye.buffer,oe=ye.type,$=ye.bytesPerElement;if(se.isInterleavedBufferAttribute){var he=se.data,De=he.stride,Je=se.offset;he&&he.isInstancedInterleavedBuffer?(V.enableAttributeAndDivisor(j,he.meshPerAttribute),y.maxInstancedCount===void 0&&(y.maxInstancedCount=he.meshPerAttribute*he.count)):V.enableAttribute(j),E.bindBuffer(E.ARRAY_BUFFER,Le),E.vertexAttribPointer(j,me,oe,_e,De*$,Je*$)}else se.isInstancedBufferAttribute?(V.enableAttributeAndDivisor(j,se.meshPerAttribute),y.maxInstancedCount===void 0&&(y.maxInstancedCount=se.meshPerAttribute*se.count)):V.enableAttribute(j),E.bindBuffer(E.ARRAY_BUFFER,Le),E.vertexAttribPointer(j,me,oe,_e,0,0)}else if(fe!==void 0){var Pe=fe[Y];if(Pe!==void 0)switch(Pe.length){case 2:E.vertexAttrib2fv(j,Pe);break;case 3:E.vertexAttrib3fv(j,Pe);break;case 4:E.vertexAttrib4fv(j,Pe);break;default:E.vertexAttrib1fv(j,Pe)}}}}V.disableUnusedAttributes()}this.compile=function(d,m){c=Ve.get(d,m),c.init(),d.traverse(function(y){y.isLight&&(c.pushLight(y),y.castShadow&&c.pushShadow(y))}),c.setupLights(m),d.traverse(function(y){if(y.material)if(Array.isArray(y.material))for(var B=0;B<y.material.length;B++)Ee(y.material[B],d.fog,y);else Ee(y.material,d.fog,y)})};var be=null;function ie(d){Ye.isPresenting()||be&&be(d)}var Se=new Li;Se.setAnimationLoop(ie),typeof window<"u"&&Se.setContext(window),this.setAnimationLoop=function(d){be=d,Ye.setAnimationLoop(d),Se.start()},this.render=function(d,m,y,B){if(!(m&&m.isCamera)){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(!p){S.geometry=null,S.program=null,S.wireframe=!1,w=-1,L=null,d.autoUpdate===!0&&d.updateMatrixWorld(),m.parent===null&&m.updateMatrixWorld(),Ye.enabled&&(m=Ye.getCamera(m)),c=Ve.get(d,m),c.init(),d.onBeforeRender(h,d,m,y),g.multiplyMatrices(m.projectionMatrix,m.matrixWorldInverse),q.setFromMatrix(g),X=this.localClippingEnabled,K=Q.init(this.clippingPlanes,X,m),f=qe.get(d,m),f.init(),Ne(d,m,0,h.sortObjects),h.sortObjects===!0&&f.sort(),K&&Q.beginShadows();var W=c.state.shadowsArray;Ot.render(W,d,m),c.setupLights(m),K&&Q.endShadows(),this.info.autoReset&&this.info.reset(),y===void 0&&(y=null),this.setRenderTarget(y),He.render(f,d,m,B);var fe=f.opaque,Y=f.transparent;if(d.overrideMaterial){var j=d.overrideMaterial;fe.length&&Ce(fe,d,m,j),Y.length&&Ce(Y,d,m,j)}else fe.length&&Ce(fe,d,m),Y.length&&Ce(Y,d,m);y&&(ee.updateRenderTargetMipmap(y),ee.updateMultisampleRenderTarget(y)),V.buffers.depth.setTest(!0),V.buffers.depth.setMask(!0),V.buffers.color.setMask(!0),V.setPolygonOffset(!1),d.onAfterRender(h,d,m),Ye.enabled&&Ye.submitFrame(),f=null,c=null}};function Ne(d,m,y,B){if(d.visible!==!1){var W=d.layers.test(m.layers);if(W){if(d.isGroup)y=d.renderOrder;else if(d.isLight)c.pushLight(d),d.castShadow&&c.pushShadow(d);else if(d.isSprite){if(!d.frustumCulled||q.intersectsSprite(d)){B&&x.setFromMatrixPosition(d.matrixWorld).applyMatrix4(g);var fe=Re.update(d),Y=d.material;f.push(d,fe,Y,y,x.z,null)}}else if(d.isImmediateRenderObject)B&&x.setFromMatrixPosition(d.matrixWorld).applyMatrix4(g),f.push(d,null,d.material,y,x.z,null);else if((d.isMesh||d.isLine||d.isPoints)&&(d.isSkinnedMesh&&d.skeleton.update(),!d.frustumCulled||q.intersectsObject(d))){B&&x.setFromMatrixPosition(d.matrixWorld).applyMatrix4(g);var fe=Re.update(d),Y=d.material;if(Array.isArray(Y))for(var j=fe.groups,se=0,_e=j.length;se<_e;se++){var me=j[se],ye=Y[me.materialIndex];ye&&ye.visible&&f.push(d,fe,ye,y,x.z,me)}else Y.visible&&f.push(d,fe,Y,y,x.z,null)}}for(var Le=d.children,se=0,_e=Le.length;se<_e;se++)Ne(Le[se],m,y,B)}}function Ce(d,m,y,B){for(var W=0,fe=d.length;W<fe;W++){var Y=d[W],j=Y.object,se=Y.geometry,_e=B===void 0?Y.material:B,me=Y.group;if(y.isArrayCamera){b=y;for(var ye=y.cameras,Le=0,oe=ye.length;Le<oe;Le++){var $=ye[Le];if(j.layers.test($.layers)){if("viewport"in $)V.viewport(R.copy($.viewport));else{var he=$.bounds,De=he.x*A,Je=he.y*F,Pe=he.z*A,tt=he.w*F;V.viewport(R.set(De,Je,Pe,tt).multiplyScalar(N))}c.setupLights($),st(j,m,$,se,_e,me)}}}else b=null,st(j,m,y,se,_e,me)}}function st(d,m,y,B,W,fe){if(d.onBeforeRender(h,m,y,B,W,fe),c=Ve.get(m,b||y),d.modelViewMatrix.multiplyMatrices(y.matrixWorldInverse,d.matrixWorld),d.normalMatrix.getNormalMatrix(d.modelViewMatrix),d.isImmediateRenderObject){V.setMaterial(W);var Y=Ze(y,m.fog,W,d);S.geometry=null,S.program=null,S.wireframe=!1,ne(d,Y)}else h.renderBufferDirect(y,m.fog,B,W,d,fe);d.onAfterRender(h,m,y,B,W,fe),c=Ve.get(m,b||y)}function Ee(d,m,y){var B=te.get(d),W=c.state.lights,fe=c.state.shadowsArray,Y=B.lightsHash,j=W.state.hash,se=ge.getParameters(d,W.state,fe,m,Q.numPlanes,Q.numIntersection,y),_e=ge.getProgramCode(d,se),me=B.program,ye=!0;if(me===void 0)d.addEventListener("dispose",Vt);else if(me.code!==_e)C(d);else if(Y.stateID!==j.stateID||Y.directionalLength!==j.directionalLength||Y.pointLength!==j.pointLength||Y.spotLength!==j.spotLength||Y.rectAreaLength!==j.rectAreaLength||Y.hemiLength!==j.hemiLength||Y.shadowsLength!==j.shadowsLength)Y.stateID=j.stateID,Y.directionalLength=j.directionalLength,Y.pointLength=j.pointLength,Y.spotLength=j.spotLength,Y.rectAreaLength=j.rectAreaLength,Y.hemiLength=j.hemiLength,Y.shadowsLength=j.shadowsLength,ye=!1;else{if(se.shaderID!==void 0)return;ye=!1}if(ye){if(se.shaderID){var Le=it[se.shaderID];B.shader={name:d.type,uniforms:Ut(Le.uniforms),vertexShader:Le.vertexShader,fragmentShader:Le.fragmentShader}}else B.shader={name:d.type,uniforms:d.uniforms,vertexShader:d.vertexShader,fragmentShader:d.fragmentShader};d.onBeforeCompile(B.shader,h),_e=ge.getProgramCode(d,se),me=ge.acquireProgram(d,B.shader,se,_e),B.program=me,d.program=me}var oe=me.getAttributes();if(d.morphTargets){d.numSupportedMorphTargets=0;for(var $=0;$<h.maxMorphTargets;$++)oe["morphTarget"+$]>=0&&d.numSupportedMorphTargets++}if(d.morphNormals){d.numSupportedMorphNormals=0;for(var $=0;$<h.maxMorphNormals;$++)oe["morphNormal"+$]>=0&&d.numSupportedMorphNormals++}var he=B.shader.uniforms;(!d.isShaderMaterial&&!d.isRawShaderMaterial||d.clipping===!0)&&(B.numClippingPlanes=Q.numPlanes,B.numIntersection=Q.numIntersection,he.clippingPlanes=Q.uniform),B.fog=m,Y===void 0&&(B.lightsHash=Y={}),Y.stateID=j.stateID,Y.directionalLength=j.directionalLength,Y.pointLength=j.pointLength,Y.spotLength=j.spotLength,Y.rectAreaLength=j.rectAreaLength,Y.hemiLength=j.hemiLength,Y.shadowsLength=j.shadowsLength,d.lights&&(he.ambientLightColor.value=W.state.ambient,he.directionalLights.value=W.state.directional,he.spotLights.value=W.state.spot,he.rectAreaLights.value=W.state.rectArea,he.pointLights.value=W.state.point,he.hemisphereLights.value=W.state.hemi,he.directionalShadowMap.value=W.state.directionalShadowMap,he.directionalShadowMatrix.value=W.state.directionalShadowMatrix,he.spotShadowMap.value=W.state.spotShadowMap,he.spotShadowMatrix.value=W.state.spotShadowMatrix,he.pointShadowMap.value=W.state.pointShadowMap,he.pointShadowMatrix.value=W.state.pointShadowMatrix);var De=B.program.getUniforms(),Je=ut.seqWithValue(De.seq,he);B.uniformsList=Je}function Ze(d,m,y,B){D=0;var W=te.get(y),fe=c.state.lights,Y=W.lightsHash,j=fe.state.hash;if(K&&(X||d!==L)){var se=d===L&&y.id===w;Q.setState(y.clippingPlanes,y.clipIntersection,y.clipShadows,d,W,se)}y.needsUpdate===!1&&(W.program===void 0||y.fog&&W.fog!==m||y.lights&&(Y.stateID!==j.stateID||Y.directionalLength!==j.directionalLength||Y.pointLength!==j.pointLength||Y.spotLength!==j.spotLength||Y.rectAreaLength!==j.rectAreaLength||Y.hemiLength!==j.hemiLength||Y.shadowsLength!==j.shadowsLength)||W.numClippingPlanes!==void 0&&(W.numClippingPlanes!==Q.numPlanes||W.numIntersection!==Q.numIntersection))&&(y.needsUpdate=!0),y.needsUpdate&&(Ee(y,m,B),y.needsUpdate=!1);var _e=!1,me=!1,ye=!1,Le=W.program,oe=Le.getUniforms(),$=W.shader.uniforms;if(V.useProgram(Le.program)&&(_e=!0,me=!0,ye=!0),y.id!==w&&(w=y.id,me=!0),_e||L!==d){if(oe.setValue(E,"projectionMatrix",d.projectionMatrix),G.logarithmicDepthBuffer&&oe.setValue(E,"logDepthBufFC",2/(Math.log(d.far+1)/Math.LN2)),L!==d&&(L=d,me=!0,ye=!0),y.isShaderMaterial||y.isMeshPhongMaterial||y.isMeshStandardMaterial||y.envMap){var he=oe.map.cameraPosition;he!==void 0&&he.setValue(E,x.setFromMatrixPosition(d.matrixWorld))}(y.isMeshPhongMaterial||y.isMeshLambertMaterial||y.isMeshBasicMaterial||y.isMeshStandardMaterial||y.isShaderMaterial||y.skinning)&&oe.setValue(E,"viewMatrix",d.matrixWorldInverse)}if(y.skinning){oe.setOptional(E,B,"bindMatrix"),oe.setOptional(E,B,"bindMatrixInverse");var De=B.skeleton;if(De){var Je=De.bones;if(G.floatVertexTextures){if(De.boneTexture===void 0){var Pe=Math.sqrt(Je.length*4);Pe=xe.ceilPowerOfTwo(Pe),Pe=Math.max(Pe,4);var tt=new Float32Array(Pe*Pe*4);tt.set(De.boneMatrices);var Ht=new It(tt,Pe,Pe,ft,Pt);Ht.needsUpdate=!0,De.boneMatrices=tt,De.boneTexture=Ht,De.boneTextureSize=Pe}oe.setValue(E,"boneTexture",De.boneTexture),oe.setValue(E,"boneTextureSize",De.boneTextureSize)}else oe.setOptional(E,De,"boneMatrices")}}return me&&(oe.setValue(E,"toneMappingExposure",h.toneMappingExposure),oe.setValue(E,"toneMappingWhitePoint",h.toneMappingWhitePoint),y.lights&&jr($,ye),m&&y.fog&&Gr($,m),y.isMeshBasicMaterial?Be($,y):y.isMeshLambertMaterial?(Be($,y),Vr($,y)):y.isMeshPhongMaterial?(Be($,y),y.isMeshToonMaterial?Hr($,y):Ai($,y)):y.isMeshStandardMaterial?(Be($,y),y.isMeshPhysicalMaterial?kr($,y):Ri($,y)):y.isMeshMatcapMaterial?(Be($,y),Wr($,y)):y.isMeshDepthMaterial?(Be($,y),Xr($,y)):y.isMeshDistanceMaterial?(Be($,y),qr($,y)):y.isMeshNormalMaterial?(Be($,y),Yr($,y)):y.isLineBasicMaterial?(Nr($,y),y.isLineDashedMaterial&&Br($,y)):y.isPointsMaterial?Or($,y):y.isSpriteMaterial?zr($,y):y.isShadowMaterial&&($.color.value=y.color,$.opacity.value=y.opacity),$.ltc_1!==void 0&&($.ltc_1.value=Z.LTC_1),$.ltc_2!==void 0&&($.ltc_2.value=Z.LTC_2),ut.upload(E,W.uniformsList,$,h)),y.isShaderMaterial&&y.uniformsNeedUpdate===!0&&(ut.upload(E,W.uniformsList,$,h),y.uniformsNeedUpdate=!1),y.isSpriteMaterial&&oe.setValue(E,"center",B.center),oe.setValue(E,"modelViewMatrix",B.modelViewMatrix),oe.setValue(E,"normalMatrix",B.normalMatrix),oe.setValue(E,"modelMatrix",B.matrixWorld),Le}function Be(d,m){d.opacity.value=m.opacity,m.color&&(d.diffuse.value=m.color),m.emissive&&d.emissive.value.copy(m.emissive).multiplyScalar(m.emissiveIntensity),m.map&&(d.map.value=m.map),m.alphaMap&&(d.alphaMap.value=m.alphaMap),m.specularMap&&(d.specularMap.value=m.specularMap),m.envMap&&(d.envMap.value=m.envMap,d.flipEnvMap.value=m.envMap.isCubeTexture?-1:1,d.reflectivity.value=m.reflectivity,d.refractionRatio.value=m.refractionRatio,d.maxMipLevel.value=te.get(m.envMap).__maxMipLevel),m.lightMap&&(d.lightMap.value=m.lightMap,d.lightMapIntensity.value=m.lightMapIntensity),m.aoMap&&(d.aoMap.value=m.aoMap,d.aoMapIntensity.value=m.aoMapIntensity);var y;m.map?y=m.map:m.specularMap?y=m.specularMap:m.displacementMap?y=m.displacementMap:m.normalMap?y=m.normalMap:m.bumpMap?y=m.bumpMap:m.roughnessMap?y=m.roughnessMap:m.metalnessMap?y=m.metalnessMap:m.alphaMap?y=m.alphaMap:m.emissiveMap&&(y=m.emissiveMap),y!==void 0&&(y.isWebGLRenderTarget&&(y=y.texture),y.matrixAutoUpdate===!0&&y.updateMatrix(),d.uvTransform.value.copy(y.matrix))}function Nr(d,m){d.diffuse.value=m.color,d.opacity.value=m.opacity}function Br(d,m){d.dashSize.value=m.dashSize,d.totalSize.value=m.dashSize+m.gapSize,d.scale.value=m.scale}function Or(d,m){d.diffuse.value=m.color,d.opacity.value=m.opacity,d.size.value=m.size*N,d.scale.value=F*.5,d.map.value=m.map,m.map!==null&&(m.map.matrixAutoUpdate===!0&&m.map.updateMatrix(),d.uvTransform.value.copy(m.map.matrix))}function zr(d,m){d.diffuse.value=m.color,d.opacity.value=m.opacity,d.rotation.value=m.rotation,d.map.value=m.map,m.map!==null&&(m.map.matrixAutoUpdate===!0&&m.map.updateMatrix(),d.uvTransform.value.copy(m.map.matrix))}function Gr(d,m){d.fogColor.value=m.color,m.isFog?(d.fogNear.value=m.near,d.fogFar.value=m.far):m.isFogExp2&&(d.fogDensity.value=m.density)}function Vr(d,m){m.emissiveMap&&(d.emissiveMap.value=m.emissiveMap)}function Ai(d,m){d.specular.value=m.specular,d.shininess.value=Math.max(m.shininess,1e-4),m.emissiveMap&&(d.emissiveMap.value=m.emissiveMap),m.bumpMap&&(d.bumpMap.value=m.bumpMap,d.bumpScale.value=m.bumpScale,m.side===We&&(d.bumpScale.value*=-1)),m.normalMap&&(d.normalMap.value=m.normalMap,d.normalScale.value.copy(m.normalScale),m.side===We&&d.normalScale.value.negate()),m.displacementMap&&(d.displacementMap.value=m.displacementMap,d.displacementScale.value=m.displacementScale,d.displacementBias.value=m.displacementBias)}function Hr(d,m){Ai(d,m),m.gradientMap&&(d.gradientMap.value=m.gradientMap)}function Ri(d,m){d.roughness.value=m.roughness,d.metalness.value=m.metalness,m.roughnessMap&&(d.roughnessMap.value=m.roughnessMap),m.metalnessMap&&(d.metalnessMap.value=m.metalnessMap),m.emissiveMap&&(d.emissiveMap.value=m.emissiveMap),m.bumpMap&&(d.bumpMap.value=m.bumpMap,d.bumpScale.value=m.bumpScale,m.side===We&&(d.bumpScale.value*=-1)),m.normalMap&&(d.normalMap.value=m.normalMap,d.normalScale.value.copy(m.normalScale),m.side===We&&d.normalScale.value.negate()),m.displacementMap&&(d.displacementMap.value=m.displacementMap,d.displacementScale.value=m.displacementScale,d.displacementBias.value=m.displacementBias),m.envMap&&(d.envMapIntensity.value=m.envMapIntensity)}function kr(d,m){Ri(d,m),d.reflectivity.value=m.reflectivity,d.clearCoat.value=m.clearCoat,d.clearCoatRoughness.value=m.clearCoatRoughness}function Wr(d,m){m.matcap&&(d.matcap.value=m.matcap),m.bumpMap&&(d.bumpMap.value=m.bumpMap,d.bumpScale.value=m.bumpScale,m.side===We&&(d.bumpScale.value*=-1)),m.normalMap&&(d.normalMap.value=m.normalMap,d.normalScale.value.copy(m.normalScale),m.side===We&&d.normalScale.value.negate()),m.displacementMap&&(d.displacementMap.value=m.displacementMap,d.displacementScale.value=m.displacementScale,d.displacementBias.value=m.displacementBias)}function Xr(d,m){m.displacementMap&&(d.displacementMap.value=m.displacementMap,d.displacementScale.value=m.displacementScale,d.displacementBias.value=m.displacementBias)}function qr(d,m){m.displacementMap&&(d.displacementMap.value=m.displacementMap,d.displacementScale.value=m.displacementScale,d.displacementBias.value=m.displacementBias),d.referencePosition.value.copy(m.referencePosition),d.nearDistance.value=m.nearDistance,d.farDistance.value=m.farDistance}function Yr(d,m){m.bumpMap&&(d.bumpMap.value=m.bumpMap,d.bumpScale.value=m.bumpScale,m.side===We&&(d.bumpScale.value*=-1)),m.normalMap&&(d.normalMap.value=m.normalMap,d.normalScale.value.copy(m.normalScale),m.side===We&&d.normalScale.value.negate()),m.displacementMap&&(d.displacementMap.value=m.displacementMap,d.displacementScale.value=m.displacementScale,d.displacementBias.value=m.displacementBias)}function jr(d,m){d.ambientLightColor.needsUpdate=m,d.directionalLights.needsUpdate=m,d.pointLights.needsUpdate=m,d.spotLights.needsUpdate=m,d.rectAreaLights.needsUpdate=m,d.hemisphereLights.needsUpdate=m}function Zr(){var d=D;return d>=G.maxTextures&&console.warn("THREE.WebGLRenderer: Trying to use "+d+" texture units while this GPU supports only "+G.maxTextures),D+=1,d}this.allocTextureUnit=Zr,this.setTexture2D=function(){var d=!1;return function(y,B){y&&y.isWebGLRenderTarget&&(d||(console.warn("THREE.WebGLRenderer.setTexture2D: don't use render targets as textures. Use their .texture property instead."),d=!0),y=y.texture),ee.setTexture2D(y,B)}}(),this.setTexture3D=function(){return function(m,y){ee.setTexture3D(m,y)}}(),this.setTexture=function(){var d=!1;return function(y,B){d||(console.warn("THREE.WebGLRenderer: .setTexture is deprecated, use setTexture2D instead."),d=!0),ee.setTexture2D(y,B)}}(),this.setTextureCube=function(){var d=!1;return function(y,B){y&&y.isWebGLRenderTargetCube&&(d||(console.warn("THREE.WebGLRenderer.setTextureCube: don't use cube render targets as textures. Use their .texture property instead."),d=!0),y=y.texture),y&&y.isCubeTexture||Array.isArray(y.image)&&y.image.length===6?ee.setTextureCube(y,B):ee.setTextureCubeDynamic(y,B)}}(),this.setFramebuffer=function(d){v=d},this.getRenderTarget=function(){return _},this.setRenderTarget=function(d){_=d,d&&te.get(d).__webglFramebuffer===void 0&&ee.setupRenderTarget(d);var m=v,y=!1;if(d){var B=te.get(d).__webglFramebuffer;d.isWebGLRenderTargetCube?(m=B[d.activeCubeFace],y=!0):d.isWebGLMultisampleRenderTarget?m=te.get(d).__webglMultisampledFramebuffer:m=B,R.copy(d.viewport),P.copy(d.scissor),U=d.scissorTest}else R.copy(H).multiplyScalar(N),P.copy(z).multiplyScalar(N),U=k;if(M!==m&&(E.bindFramebuffer(E.FRAMEBUFFER,m),M=m),V.viewport(R),V.scissor(P),V.setScissorTest(U),y){var W=te.get(d.texture);E.framebufferTexture2D(E.FRAMEBUFFER,E.COLOR_ATTACHMENT0,E.TEXTURE_CUBE_MAP_POSITIVE_X+d.activeCubeFace,W.__webglTexture,d.activeMipMapLevel)}},this.readRenderTargetPixels=function(d,m,y,B,W,fe){if(!(d&&d.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}var Y=te.get(d).__webglFramebuffer;if(Y){var j=!1;Y!==M&&(E.bindFramebuffer(E.FRAMEBUFFER,Y),j=!0);try{var se=d.texture,_e=se.format,me=se.type;if(_e!==ft&&Fe.convert(_e)!==E.getParameter(E.IMPLEMENTATION_COLOR_READ_FORMAT)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(me!==$t&&Fe.convert(me)!==E.getParameter(E.IMPLEMENTATION_COLOR_READ_TYPE)&&!(me===Pt&&(G.isWebGL2||O.get("OES_texture_float")||O.get("WEBGL_color_buffer_float")))&&!(me===Si&&(G.isWebGL2?O.get("EXT_color_buffer_float"):O.get("EXT_color_buffer_half_float")))){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}E.checkFramebufferStatus(E.FRAMEBUFFER)===E.FRAMEBUFFER_COMPLETE?m>=0&&m<=d.width-B&&y>=0&&y<=d.height-W&&E.readPixels(m,y,B,W,Fe.convert(_e),Fe.convert(me),fe):console.error("THREE.WebGLRenderer.readRenderTargetPixels: readPixels from renderTarget failed. Framebuffer not complete.")}finally{j&&E.bindFramebuffer(E.FRAMEBUFFER,M)}}},this.copyFramebufferToTexture=function(d,m,y){var B=m.image.width,W=m.image.height,fe=Fe.convert(m.format);this.setTexture2D(m,0),E.copyTexImage2D(E.TEXTURE_2D,y||0,fe,d.x,d.y,B,W,0)},this.copyTextureToTexture=function(d,m,y,B){var W=m.image.width,fe=m.image.height,Y=Fe.convert(y.format),j=Fe.convert(y.type);this.setTexture2D(y,0),m.isDataTexture?E.texSubImage2D(E.TEXTURE_2D,B||0,d.x,d.y,W,fe,Y,j,m.image.data):E.texSubImage2D(E.TEXTURE_2D,B||0,d.x,d.y,Y,j,m.image)}}const Ol=`
varying vec2 vUv;

void main() {
    vUv = vec2(uv.x, 1.0 - uv.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,zl=`
varying vec2 vUv;
uniform sampler2D tDiffuse;

void main() {
    gl_FragColor = texture2D(tDiffuse, vUv);
}
`;class Vl{renderer;material;sceneRTT;cameraRTT;rtTexture;canvas=null;animated=!1;zoom=1;orientation="portrait";selfie=!1;constructor(){const t=new xt;t.needsUpdate=!0,this.material=new nt({uniforms:{tDiffuse:{value:t}},vertexShader:Ol,fragmentShader:zl}),this.cameraRTT=this.buildCamera(!0),this.sceneRTT=this.buildScene(),this.rtTexture=this.buildTarget(),this.renderer=new Bl,this.renderer.setSize(window.innerWidth,window.innerHeight),this.renderer.autoClear=!1;const i=document.createElement("div");i.id="three-game-render",i.style.display="none",i.appendChild(this.renderer.domElement),document.body.append(i),window.addEventListener("resize",()=>this.rebuild(!this.animated)),requestAnimationFrame(this.animate)}renderToTarget(t){this.rebuild(!1),this.canvas=t,this.animated=!0}setZoom(t){this.zoom=t>0?t:1,this.animated&&this.rebuild(!1)}setOrientation(t){this.orientation=t,this.animated&&this.rebuild(!1)}setSelfie(t){this.selfie=t,this.animated&&this.rebuild(!1)}stop(){this.animated=!1,this.canvas=null,this.rebuild(!0)}buildCamera(t){const i=window.innerWidth,r=window.innerHeight,n=new yi(i/-2,i/2,r/2,r/-2,-1e4,1e4);if(n.position.z=0,t)n.setViewOffset(i,r,0,0,i,r);else{const a=this.selfie?Jr:0,s=Qr(i,r,this.zoom,this.orientation,a);n.setViewOffset(i,r,s.offsetX,s.offsetY,s.width,s.height)}return n}buildScene(){const t=new Ei,i=new Ft(new Et(window.innerWidth,window.innerHeight),this.material);return i.position.z=-100,t.add(i),t}buildTarget(){return new jt(window.innerWidth,window.innerHeight,{minFilter:pt,magFilter:Ge,format:ft,type:$t})}rebuild(t){this.cameraRTT=this.buildCamera(t),this.sceneRTT=this.buildScene(),this.rtTexture=this.buildTarget(),this.renderer.setSize(window.innerWidth,window.innerHeight)}animate=()=>{if(requestAnimationFrame(this.animate),!this.animated||!this.canvas)return;const t=window.innerWidth,i=window.innerHeight;this.renderer.clear(),this.renderer.render(this.sceneRTT,this.cameraRTT,this.rtTexture,!0);const r=new Uint8Array(t*i*4);this.renderer.readRenderTargetPixels(this.rtTexture,0,0,t,i,r),this.canvas.width=t,this.canvas.height=i;const n=this.canvas.getContext("2d");n&&n.putImageData(new ImageData(new Uint8ClampedArray(r.buffer),t,i),0,0)}}export{Vl as GameRender};
