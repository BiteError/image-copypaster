import { Jimp } from 'jimp'

export async function CreateBitmap(blob) {
   const jimpImage = await Jimp.read(blob);
   return new JimpBitmap(jimpImage);
}

export async function CreateBitmapFromArray(array, width, height) {
    const pixelBuffer = Buffer.from(array); 
    const jimpImage = await Jimp.fromBitmap({
        data: pixelBuffer,
        width: width,
        height: height
    });
    return new JimpBitmap(jimpImage);
}

export function CreateEmptyBitmap() {
   return new EmptyBitmap();
}

class EmptyBitmap {
    constructor(width = 300, height = 150) {
        this.width = width;
        this.height = height;
    }

    clone() {
        return this;
    }

    isEmpty() {
        return true;
    }

    data(){
        return null;
    }
}

export class JimpBitmap {
    constructor(jimpImage) {
        this.width = jimpImage.bitmap.width;
        this.height = jimpImage.bitmap.height;
        this.jimp_container = jimpImage;
    }

    data(){
        return this.jimp_container.bitmap.data;
    }

    clone() {
        return new JimpBitmap(this.jimp_container.clone());
    }

    update(){
        this.width = this.jimp_container.bitmap.width;
        this.height = this.jimp_container.bitmap.height;
        return this;
    }

    resize(width, height){
        this.jimp_container.resize({w: width, h: height});
        return this.update();
    }

    rotate_cw(){
        //For some reason Jimp rotates image counter-clockwise by degree
        this.jimp_container.rotate(-90);
        return this.update();
    }

    rotate_ccw(){
        this.jimp_container.rotate(90);
        return this.update();
    }

    flip_horizontal(){
        this.jimp_container.flip({horizontal: true, vertical: false});
        return this.update();
    }

    flip_vertical(){
        this.jimp_container.flip({horizontal: false, vertical: true});
        return this.update();
    }

    make_color_transparent(color){
        const data = this.data();
        this.jimp_container.scan(0, 0, this.width, this.height, (x, y, idx) => {
            if (data[idx] === color.r && 
                data[idx+1] === color.g && 
                data[idx+2] === color.b) {
                data[idx+3] = 0;
            }
        });
        return this.update();
    }

    pixel_color(x, y){
        const data = this.data();
        const idx = (y * this.width + x) * 4;
        return { r: data[idx], g: data[idx+1], b: data[idx+2] };
    }

    composite(bitmap, x, y){
        this.jimp_container.composite(bitmap.jimp_container, x, y)
    }

    crop(x, y, w, h){
        const cropped = this.jimp_container.crop({x : x, y: y, w: w, h: h});
        return this.update();
    }

    async getBufferAsync(){
        return await this.jimp_container.getBuffer('image/png');
    }

    isEmpty() {
        return false;
    }
}
