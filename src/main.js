import './style.css';
import ImageModel from './image_model.js';
import ImageView from './image_view.js';
import ImageController from './image_controller.js';
import ErrorBus, { installGlobalErrorHandlers } from './error_bus.js';

const bus = new ErrorBus();
installGlobalErrorHandlers(bus);

const app = new ImageController(new ImageModel(), new ImageView(bus), bus);

document.getElementById('toolbar').style.visibility = 'visible';
