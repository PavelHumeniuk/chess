import type { EndgamePosition } from './engine/eval';

export interface EndgameTheory {
  title: string;
  overview: string;
  principles: string[];
  method: string[];
  mistakes: string[];
}

const THEORY_BY_CHAPTER: Record<string, EndgameTheory> = {
  'The Staircase': {
    title: 'Two-Rook Ladder Mate',
    overview: 'This ending is about reducing the enemy king step by step. The rooks do the boxing; your king mainly stays safe and avoids interfering.',
    principles: [
      'Keep the rooks on different ranks or files so they build a wall.',
      'Take away one full rank or file at a time rather than hunting for checks randomly.',
      'Do not place the rooks where the enemy king can attack both in sequence.',
    ],
    method: [
      'Use one rook to cut the king off.',
      'Bring the second rook up to create the next barrier.',
      'Repeat the shrinking process until the king is trapped on the back rank or edge.',
    ],
    mistakes: [
      'Checking from too close and allowing the king to approach a rook.',
      'Putting both rooks on the same line so they lose coordination.',
      'Trying to mate immediately instead of tightening the box first.',
    ],
  },
  'Queen vs. Lone King': {
    title: 'Queen Mate Technique',
    overview: 'The queen wins by restricting squares, not by giving endless checks. The king must join at the end to remove escape squares safely.',
    principles: [
      'Use the queen to build a box around the king.',
      'Keep the queen a knight move away when possible to avoid stalemate tricks and accidental contact.',
      'Bring your king closer before going for the final mating net.',
    ],
    method: [
      'Shrink the enemy king’s box with quiet queen moves or safe checks.',
      'Walk your king up while preserving the box.',
      'Once the king is trapped on the edge, coordinate king and queen for mate.',
    ],
    mistakes: [
      'Checking endlessly without improving the position.',
      'Bringing the queen too close and allowing perpetual harassment.',
      'Forgetting stalemate patterns in cramped corners.',
    ],
  },
  'Basic Opposition': {
    title: 'Opposition In King And Pawn Endings',
    overview: 'Opposition means using king placement to force the other king to yield a key square. In simple king-and-pawn endings, one tempo often decides the result.',
    principles: [
      'Think in terms of key squares, not just pawn pushes.',
      'Direct opposition matters when kings face each other with one square in between.',
      'The side that wins opposition often wins space for the pawn or king entry.',
    ],
    method: [
      'First decide whether you need king activity or a pawn push.',
      'Use king moves to hand the move to the defender in a worse version of the position.',
      'Only advance the pawn once the king route or promotion square is under control.',
    ],
    mistakes: [
      'Pushing the pawn too early and losing the key-square race.',
      'Ignoring whose move it is.',
      'Trying to force progress before winning the opposition battle.',
    ],
  },
  'The Square Of The Pawn': {
    title: 'The Square Rule',
    overview: 'This is the first calculation shortcut in pawn endings. Before you calculate deeply, check whether the defending king is inside or outside the pawn’s square.',
    principles: [
      'Build the square from the pawn to its promotion square.',
      'If the king can enter the square, it may still catch the pawn.',
      'If your king can support the pawn, the square rule is only the starting point.',
    ],
    method: [
      'Visualize the square immediately.',
      'Check whether either king can change the race with tempi or support.',
      'Convert the race into a king-and-pawn ending if both sides promote chances exist.',
    ],
    mistakes: [
      'Using the square rule without noticing whose move it is.',
      'Ignoring support from the attacking king.',
      'Assuming every outside king is too late without calculation.',
    ],
  },
  'King And Pawn vs. Lone King': {
    title: 'Key Squares And Pawn Support',
    overview: 'These endings are won by escorting the king to the right squares before the pawn overextends. The core lesson is whether your king can occupy a decisive square in time.',
    principles: [
      'Know the key squares for the pawn.',
      'Your king usually leads and the pawn follows.',
      'Tempo and move order are often more important than material.',
    ],
    method: [
      'Identify whether the current king placement already reaches a key square.',
      'Use opposition or triangulation if the route is blocked.',
      'Push only when the pawn advance supports promotion rather than blocks your king.',
    ],
    mistakes: [
      'Playing the pawn before fixing king placement.',
      'Walking to the wrong side of the pawn.',
      'Missing the drawing zone when the defending king is already in front.',
    ],
  },
  'Lucena Position': {
    title: 'Lucena: Building The Bridge',
    overview: 'Lucena is the standard winning rook ending with a rook pawn-like bridge construction. The attacker uses the rook to shield the king from checks.',
    principles: [
      'The attacking king belongs in front of the pawn.',
      'The rook’s job is to cut checks and later build cover.',
      'The pawn should not be rushed if the bridge is not ready.',
    ],
    method: [
      'Get the king to the queening square area.',
      'Use the rook to interpose against side checks.',
      'Create the bridge so the king can step out from the file safely.',
    ],
    mistakes: [
      'Advancing the pawn before the king and rook are coordinated.',
      'Allowing endless side checks without a plan to block them.',
      'Putting the rook passively behind when it must shield actively.',
    ],
  },
  'Philidor Position': {
    title: 'Philidor: The Main Defensive Setup',
    overview: 'Philidor is the standard drawing method in many rook-and-pawn endings. The defender stays active and prevents the attacking king from reaching the ideal winning setup.',
    principles: [
      'Cut the king off before the pawn reaches the sixth rank.',
      'Use the rook on the key defensive rank, not passively behind the pawn too early.',
      'When the pawn advances too far, switch to checking from behind.',
    ],
    method: [
      'Hold the defensive rank while the pawn is not yet advanced enough.',
      'Force the attacker to commit the pawn push.',
      'Once the structure changes, check from the rear and maintain activity.',
    ],
    mistakes: [
      'Retreating too soon and giving the king entry.',
      'Letting the attacking king take shelter next to the pawn.',
      'Confusing Philidor with passive rook-behind defense.',
    ],
  },
  'King And Two Healthy Pawns vs. Lone King (Connected)': {
    title: 'Connected Passed Pawns',
    overview: 'Connected passers win by supporting each other. The key is timing: one pawn gains space while the other protects promotion squares and king routes.',
    principles: [
      'Connected passers are strongest when one can advance while the other covers.',
      'Your king often supports from behind or beside the chain.',
      'Do not split the pawns unnecessarily.',
    ],
    method: [
      'Choose which pawn should lead.',
      'Keep the second pawn close enough to support critical squares.',
      'Use the king to remove the defender from the shoulder of the pawn chain.',
    ],
    mistakes: [
      'Pushing both pawns equally and losing coordination.',
      'Letting the king get in front of the leading pawn.',
      'Turning connected pawns into isolated ones without reason.',
    ],
  },
  'King And Two Healthy Pawns vs. Lone King (Separated)': {
    title: 'Separated Passed Pawns',
    overview: 'Separated pawns stretch the defending king. The attacker usually wins by forcing the king toward one pawn and then switching to the other.',
    principles: [
      'Distance between pawns is your main weapon.',
      'Outside passers matter because they pull the king away from the center.',
      'Your king must be active enough to support the switch.',
    ],
    method: [
      'Decide which pawn is the decoy and which is the real winner.',
      'Push only enough to force commitment from the defending king.',
      'Use king activity to escort the remaining passer.',
    ],
    mistakes: [
      'Racing both pawns forward too soon.',
      'Ignoring king placement while focusing only on pawn moves.',
      'Allowing the defender to stay central and flexible.',
    ],
  },
  'Breakthroughs': {
    title: 'Pawn Breakthrough Technique',
    overview: 'Breakthroughs are tactical pawn sacrifices that create an unstoppable passer. The winning idea is usually forcing and depends on exact move order.',
    principles: [
      'Look for pawn sacrifices that remove the last blocker.',
      'Count tempi carefully before committing.',
      'The side that queens first is not always the side that wins if check matters.',
    ],
    method: [
      'Identify the blocked pawn chain.',
      'Find the forcing capture sequence that opens one file or diagonal.',
      'Calculate through promotion, not just through the first exchange.',
    ],
    mistakes: [
      'Making a natural king move instead of the forcing pawn shot.',
      'Stopping calculation too early.',
      'Ignoring whether the passer queens with check or without check.',
    ],
  },
  'Strange Races': {
    title: 'Pawn Race Calculation',
    overview: 'In pawn races, the winning line is usually concrete. General principles help, but exact counting decides the result.',
    principles: [
      'Count tempi from the current move, not from the move after.',
      'Promotion with check changes everything.',
      'Kings can sometimes join the race in ways that look impossible at first glance.',
    ],
    method: [
      'Calculate both promotion races side by side.',
      'Check whether one side can improve the race with a king move or intermediate move.',
      'Only then choose between pushing, checking, or king activation.',
    ],
    mistakes: [
      'Assuming fastest promotion always wins.',
      'Forgetting check tempo at promotion.',
      'Ignoring a king route that changes the evaluation.',
    ],
  },
  'Trebuchet': {
    title: 'Trebuchet And Reciprocal Zugzwang',
    overview: 'Trebuchet positions are classic king-and-pawn zugzwangs where whichever side moves first loses the critical square battle.',
    principles: [
      'Move order is the position.',
      'The kings and pawns are balanced until one side is forced to blink.',
      'Reserve tempi outside the immediate contact zone are gold.',
    ],
    method: [
      'Identify whether the structure is reciprocal zugzwang.',
      'Search for waiting moves or reserve tempi.',
      'If there are none, convert the position to the winning king route after the opponent yields.',
    ],
    mistakes: [
      'Treating it like a normal opposition problem.',
      'Overvaluing pawn pushes that destroy the zugzwang geometry.',
      'Missing the only waiting move.',
    ],
  },
  'Triangulation': {
    title: 'Triangulation',
    overview: 'Triangulation is how the stronger side loses a tempo on purpose while keeping the same structure. It is a tool for turning equal opposition into winning opposition.',
    principles: [
      'The king takes a three-move route to return to a similar square with the move changed.',
      'It matters only when the structure remains favorable afterward.',
      'Triangulation is usually a means to gain opposition or force a concession.',
    ],
    method: [
      'Find a triangle path for the king.',
      'Check that the opponent has no improving reply during the triangle.',
      'Return to the key contact point when the move order favors you.',
    ],
    mistakes: [
      'Triangulating when a direct plan already wins.',
      'Walking into the wrong square color complex or side of the pawn.',
      'Ignoring whether the structure changes while you maneuver.',
    ],
  },
  'Building Blocks': {
    title: 'Building Block Method',
    overview: 'These expert-level pawn endings are won by understanding the geometric building blocks of king placement, reserve tempi, and promotion routes.',
    principles: [
      'The smallest structural edge matters.',
      'Reserve tempi often decide whether the winning geometry can be reached.',
      'Every king step must be justified by a future key-square gain.',
    ],
    method: [
      'Identify the target geometry rather than a single tactical trick.',
      'Preserve reserve tempi as long as possible.',
      'Convert once the winning king route is fixed.',
    ],
    mistakes: [
      'Spending reserve tempi too early.',
      'Calculating locally instead of seeing the final shape.',
      'Pushing the pawn when the king still needs improvement.',
    ],
  },
  'Cat And Mouse': {
    title: 'Cat And Mouse Precision',
    overview: 'These endings are about tiny tempo gains and exact king routes. One inaccurate move flips the evaluation immediately.',
    principles: [
      'Shouldering and move order are central.',
      'The race is often decided several moves before promotion.',
      'You must compare both king routes, not just your own plan.',
    ],
    method: [
      'Find the ideal king path first.',
      'Check whether shouldering or opposition denies the defender entry.',
      'Only then commit to the pawn advance sequence.',
    ],
    mistakes: [
      'Playing the obvious king move without route comparison.',
      'Ignoring the opponent’s counterplay tempo.',
      'Treating a master-level race like a basic square-rule exercise.',
    ],
  },
};

export function getEndgameTheory(position: EndgamePosition | null): EndgameTheory | null {
  if (!position) return null;
  return THEORY_BY_CHAPTER[position.chapter] ?? null;
}
