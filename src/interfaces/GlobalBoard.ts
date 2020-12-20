import LocalBoard from './LocalBoard';
import Position from './Position';

interface GlobalBoard {
    topLeft: LocalBoard;
    topCenter: LocalBoard;
    topRight: LocalBoard;
    centerLeft: LocalBoard;
    centerCenter: LocalBoard;
    centerRight: LocalBoard;
    bottomLeft: LocalBoard;
    bottomCenter: LocalBoard;
    bottomRight: LocalBoard;
    xTurn: boolean;
    activeBoard: Position;
}

export default GlobalBoard;