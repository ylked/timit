<script lang="ts" module>
  // A single floating tooltip shared by all charts. Call tip.show(event, html-safe parts) on hover.
  export const tip = $state({ visible: false, x: 0, y: 0, title: "", lines: [] as string[] });

  export function showTip(e: { clientX: number; clientY: number } | DOMRect, title: string, lines: string[] = []) {
    if ("clientX" in e) {
      tip.x = e.clientX;
      tip.y = e.clientY;
    } else {
      tip.x = e.left + e.width / 2;
      tip.y = e.top;
    }
    tip.title = title;
    tip.lines = lines;
    tip.visible = true;
  }

  export function hideTip() {
    tip.visible = false;
  }
</script>

{#if tip.visible}
  <div class="tip" style:left="{Math.min(Math.max(tip.x, 90), innerWidth - 90)}px" style:top="{tip.y}px" aria-hidden="true">
    <strong>{tip.title}</strong>
    {#each tip.lines as line}<div>{line}</div>{/each}
  </div>
{/if}
