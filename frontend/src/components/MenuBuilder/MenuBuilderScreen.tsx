import { Nav } from "../shared/Nav";
import { Canvas } from "./Canvas";
import { ChoiceEditor } from "./ChoiceEditor";

export function MenuBuilderScreen() {
  return (
    <div className="grid h-screen min-h-0 grid-cols-[minmax(180px,200px)_1fr_minmax(280px,320px)] gap-2 overflow-hidden p-2">
      <Nav />
      <Canvas />
      <ChoiceEditor />
    </div>
  );
}
