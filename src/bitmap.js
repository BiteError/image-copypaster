import { Jimp } from 'jimp'

// Largest possible Euclidean RGB distance (black vs. white), used to map the
// 0-100 tolerance slider onto make_color_transparent's raw distance argument.
const MAX_RGB_DISTANCE = Math.sqrt(3 * 255 * 255);

export function toleranceToDistance(tolerancePercent) {
    return (tolerancePercent / 100) * MAX_RGB_DISTANCE;
}

export async function CreateBitmap(blob) {
   const jimpImage = await Jimp.read(blob);
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

    make_color_transparent(color, tolerance = 0){
        const data = this.data();
        // Compare squared distances to avoid a sqrt per pixel; tolerance=0 still requires an exact match.
        const toleranceSq = tolerance * tolerance;
        this.jimp_container.scan(0, 0, this.width, this.height, (x, y, idx) => {
            const dr = data[idx] - color.r;
            const dg = data[idx+1] - color.g;
            const db = data[idx+2] - color.b;
            if (dr*dr + dg*dg + db*db <= toleranceSq) {
                data[idx+3] = 0;
            }
        });
        return this.update();
    }

    mask_ellipse(){
        const data = this.data();
        const rx = this.width / 2;
        const ry = this.height / 2;
        this.jimp_container.scan(0, 0, this.width, this.height, (x, y, idx) => {
            const nx = (x + 0.5 - rx) / rx;
            const ny = (y + 0.5 - ry) / ry;
            if (nx * nx + ny * ny > 1) {
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
        this.jimp_container.crop({x : x, y: y, w: w, h: h});
        return this.update();
    }

    async getBufferAsync(){
        return await this.jimp_container.getBuffer('image/png');
    }

    isEmpty() {
        return false;
    }
}
