(function(root){
  'use strict';
  let canvas,gl,program,count,resizeObserver,yaw=.13,pitch=0,zoom=1,dragging=false,lastX=0,lastY=0;
  const vertex=`attribute vec3 position;attribute vec3 normal;uniform float yaw;uniform float pitch;uniform float aspect;uniform float zoom;varying vec3 n;varying vec3 world;vec3 rotate(vec3 p){p=vec3(cos(yaw)*p.x+sin(yaw)*p.z,p.y,-sin(yaw)*p.x+cos(yaw)*p.z);return vec3(p.x,cos(pitch)*p.y-sin(pitch)*p.z,sin(pitch)*p.y+cos(pitch)*p.z);}void main(){world=position*.0001;n=rotate(normal);vec3 p=rotate(world-vec3(0.,.92,0.));gl_Position=vec4(p.x*zoom/aspect,p.y*zoom,-p.z*.3,1.);}`;
  const fragment=`precision mediump float;varying vec3 n;varying vec3 world;void main(){vec3 N=normalize(n),V=vec3(0.,0.,1.),L=normalize(vec3(-.6,.7,1.));float diffuse=max(dot(N,L),0.),rim=pow(1.-abs(dot(N,V)),2.2),spec=pow(max(dot(N,normalize(L+V)),0.),55.);vec3 base=mix(vec3(.14,.13,.19),vec3(.34,.31,.42),smoothstep(.1,1.8,world.y));vec3 color=base*(.55+diffuse*.7)+vec3(.64,.56,.8)*spec*.1;color+=rim*mix(vec3(.28,.49,.59),vec3(.54,.4,.72),smoothstep(-.2,.2,world.x))*.8;float gy=pow(1.-abs(sin(world.y*151.)),18.),gx=pow(1.-abs(sin(world.x*162.+world.z*24.)),18.);color=mix(color,vec3(.61,.55,.72),max(gx,gy)*.28);float glow=exp(-length((world-vec3(.042,1.365,.095))*vec3(1.,1.,.7))*45.);color+=vec3(.37,.18,.51)*glow;gl_FragColor=vec4(color,1.);}`;
  function shader(kind,source){const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Shader compilation failed');return s;}
  function initialize(){
    gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL unavailable');
    program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Shader link failed');gl.useProgram(program);
    const decode=s=>{const raw=atob(s),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;};
    const data=new Int16Array(decode(root.ASTRIS_HUMAN_MESH.vertices).buffer),indices=new Uint16Array(decode(root.ASTRIS_HUMAN_MESH.indices).buffer);count=indices.length;
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    for(const [name,offset] of [['position',0],['normal',6]]){const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.SHORT,name==='normal',12,offset);}
    const elements=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,elements);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clearColor(0,0,0,0);canvas.dataset.renderer='webgl';canvas.dataset.triangles=String(count/3);
  }
  function draw(){if(!gl||!canvas?.isConnected)return;const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;const dpr=Math.min(root.devicePixelRatio||1,2),w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);for(const [name,value] of Object.entries({yaw,pitch,zoom:zoom*1.02,aspect:r.width/r.height}))gl.uniform1f(gl.getUniformLocation(program,name),value);gl.drawElements(gl.TRIANGLES,count,gl.UNSIGNED_SHORT,0);canvas.dataset.angle=String(Math.round(yaw*180/Math.PI));const frame=canvas.closest('.anatomy-frame');if(frame)frame.classList.toggle('model-turned',Math.abs(yaw)>.45);}
  function setAngle(angle){yaw=angle==='side'?Math.PI/2:0;pitch=0;draw();}
  function mount(placeholder){
    if(!placeholder)return;
    if(canvas){placeholder.replaceWith(canvas);draw();return;}
    canvas=placeholder;
    try{initialize();}catch{canvas.dataset.renderer='unavailable';canvas.parentElement.classList.add('model-unavailable');return;}
    canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');});
    canvas.addEventListener('pointermove',e=>{if(!dragging)return;yaw+=(e.clientX-lastX)*.009;pitch=Math.max(-.3,Math.min(.3,pitch+(e.clientY-lastY)*.005));lastX=e.clientX;lastY=e.clientY;draw();});
    const end=()=>{dragging=false;canvas.classList.remove('dragging');};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
    canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key)){e.preventDefault();if(e.key==='Home')setAngle('front');if(e.key==='ArrowLeft')yaw-=.15;if(e.key==='ArrowRight')yaw+=.15;if(e.key==='ArrowUp')pitch=Math.min(.3,pitch+.08);if(e.key==='ArrowDown')pitch=Math.max(-.3,pitch-.08);draw();}});
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();canvas.dataset.renderer='lost';canvas.parentElement?.classList.add('model-unavailable');});
    canvas.addEventListener('webglcontextrestored',()=>{initialize();canvas.parentElement?.classList.remove('model-unavailable');draw();});
    resizeObserver=new ResizeObserver(draw);resizeObserver.observe(canvas);draw();
  }
  function detach(){if(canvas?.isConnected)canvas.remove();}
  root.AstrisHuman={mount,detach,setAngle,draw};
})(window);
