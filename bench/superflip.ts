import { CubieCube } from '../src/cube/cubie';
import { parseSequence, formatSequence } from '../src/cube/notation';
import { buildCoreTables } from '../src/solver/tables';
import { solveTwoPhase } from '../src/solver/twophase';
import { NOTABLE_POSITIONS } from '../src/data/facts';

buildCoreTables();
for (const p of NOTABLE_POSITIONS.slice(0, 2)) {
  const cube = CubieCube.fromMoves(parseSequence(p.scramble).moves);
  const s = solveTwoPhase(cube, { timeBudgetMs: 150000, maxLength: 20 });
  console.log(`${p.name}: ${s.length} moves, ${(s.nodes / 1e6).toFixed(0)}M nodes, ${(s.millis / 1000).toFixed(1)}s -> ${formatSequence(s.moves)}`);
  console.log('  verified:', cube.clone().applyMoves(s.moves).isSolved());
}
