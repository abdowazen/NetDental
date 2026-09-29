type State = {
  language: "en" | "fr";
  strings: Record<string, string>;
  failure: boolean;
};
declare global {
  interface Window {
    clinicConnection: {
      state(): Promise<State>;
      language(value: "en" | "fr"): Promise<State>;
      retry(): Promise<boolean>;
      onState(listener: (state: State) => void): () => void;
    };
  }
}
const element = (id: string) => document.getElementById(id)!;
let state: State;
const button = element("retry") as HTMLButtonElement;
function render(failed: boolean) {
  document.documentElement.lang = state.language;
  document.title = state.strings.appName;
  element("title").textContent =
    state.strings[failed ? "connectionTitle" : "connecting"];
  element("description").textContent =
    state.strings[failed ? "connectionDescription" : "connectingDescription"];
  button.textContent = state.strings.retry;
  button.disabled = !failed;
  element("language-label").textContent = state.strings.language;
  (element("language") as HTMLSelectElement).value = state.language;
}
void window.clinicConnection.state().then((value) => {
  state = value;
  render(state.failure);
});
window.clinicConnection.onState((value) => {
  state = value;
  render(state.failure);
});
button.onclick = async () => {
  render(false);
  await window.clinicConnection.retry();
};
element("language").onchange = async (event) => {
  state = await window.clinicConnection.language(
    (event.target as HTMLSelectElement).value as "en" | "fr",
  );
  render(state.failure);
};
export {};
