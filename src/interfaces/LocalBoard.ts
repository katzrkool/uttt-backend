import Square from './Square';

interface LocalBoard {
    topLeft: Square;
    topCenter: Square;
    topRight: Square;
    centerLeft: Square;
    centerCenter: Square;
    centerRight: Square;
    bottomLeft: Square;
    bottomCenter: Square;
    bottomRight: Square;
}

export default LocalBoard;