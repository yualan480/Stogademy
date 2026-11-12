
import { World } from "./world.js";

const VIRTUAL_SIZE = 800;

export class Game {

    constructor(canvas) {

        this.canvas = canvas;
        this.context = canvas.getContext('2d');

        this.world = new World(this);

        this._loop = this._loop.bind(this);
    }

    clearScreen() {
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;

        if (w > h) {
            if(this.canvas.width!==VIRTUAL_SIZE)this.canvas.width=VIRTUAL_SIZE;
            const height=Math.round(VIRTUAL_SIZE*(h/w));if(this.canvas.height!==height)this.canvas.height=height;
        } else {
            const width=Math.round(VIRTUAL_SIZE*(w/h));if(this.canvas.width!==width)this.canvas.width=width;
            if(this.canvas.height!==VIRTUAL_SIZE)this.canvas.height=VIRTUAL_SIZE;
        }

        this.context.fillStyle = '#e9d5b0';
        this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    _loop(time) {
        this.raf=0;
        if(this.running) {

            this.clearScreen();
            this.accumulator=(this.accumulator||0)+Math.min(.1,Math.max(0,(time-(this.lastTime??time))/1000));this.lastTime=time;
            while(this.accumulator>=1/60){this.world.update();this.accumulator-=1/60;}
            this.world.render();
            
            this.raf=requestAnimationFrame(this._loop);
        }
    }

    start() {
        if (!this.running) {
            this.running = true;this.lastTime=null;this.accumulator=0;
            this.raf=requestAnimationFrame(this._loop);
        }
        return this;
    }

    stop () {
        this.running = false;
        if(this.raf)cancelAnimationFrame(this.raf);this.raf=0;
        return this;
    }

}