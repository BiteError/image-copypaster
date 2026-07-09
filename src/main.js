import './style.css';
import ImageModel from './image_model.js';
import ImageView from './image_view.js';
import ImageController from './image_controller.js';

const app = new ImageController(new ImageModel(), new ImageView());

document.getElementById('toolbar').style.visibility = 'visible';
