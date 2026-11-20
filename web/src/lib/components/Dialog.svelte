<script lang="ts">
  // Native modal <dialog>: focus containment, Esc, inert page and focus return come from the browser.
  import type { Snippet } from "svelte";

  let {
    open = $bindable(false),
    title,
    description,
    children,
  }: { open: boolean; title: string; description?: string; children: Snippet } = $props();

  let dialog: HTMLDialogElement;
  const id = $props.id();

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });

  // Light-dismiss fallback for browsers without `closedby` (Safari): require press and release outside.
  const needsFallback = !("closedBy" in HTMLDialogElement.prototype);
  let pressedOutside = false;
  function outside(e: PointerEvent) {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  }
</script>

<dialog
  bind:this={dialog}
  {...{ closedby: "any" }}
  aria-labelledby="{id}-title"
  aria-describedby={description ? `${id}-desc` : undefined}
  onclose={() => (open = false)}
  onpointerdown={needsFallback ? (e) => (pressedOutside = outside(e)) : undefined}
  onpointerup={needsFallback ? (e) => pressedOutside && outside(e) && dialog.close() : undefined}
>
  <div class="dialog-body">
    <header>
      <h2 id="{id}-title">{title}</h2>
      {#if description}<p id="{id}-desc">{description}</p>{/if}
    </header>
    {#if open}{@render children()}{/if}
  </div>
</dialog>
