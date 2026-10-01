// Shared renderer for drawing segments. The tablet (Pizarra Plus), the OBS
// transparent layer (/cristal) and the other drawing views all paint with this
// one function, so a shape looks the same everywhere.
//
// box: { width, height, scale, x?, y? } — the drawing area in CSS pixels and the
// stroke scale relative to the 1920x1080 reference.
(function (root) {
  'use strict';

  const SHAPES = ['stroke', 'rect', 'ellipse', 'arrow', 'arrow2', 'line', 'text'];
  const MAX_TEXT = 120;

  function arrowHead(ctx, fromX, fromY, toX, toY, headLen) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  function drawPizarraShape(ctx, seg, box) {
    if (!seg || !seg.from || !seg.to || !box) return;
    const ox = box.x || 0;
    const oy = box.y || 0;
    const fromX = ox + seg.from.x * box.width;
    const fromY = oy + seg.from.y * box.height;
    const toX = ox + seg.to.x * box.width;
    const toY = oy + seg.to.y * box.height;
    const scale = box.scale || 1;
    const baseSize = seg.size || 6;
    const shape = SHAPES.includes(seg.shape) ? seg.shape : 'stroke';

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (seg.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = (baseSize * 3) * scale;
    } else if (seg.tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.38;
      ctx.strokeStyle = seg.color || '#ffd000';
      ctx.lineWidth = (baseSize * 2.8) * scale;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = seg.color || '#00f0ff';
      ctx.lineWidth = baseSize * scale;
    }

    if (seg.dash === true && shape !== 'stroke' && shape !== 'text') {
      const unit = Math.max(2, baseSize * scale);
      ctx.setLineDash([unit * 3, unit * 2]);
    }
    const filled = seg.fill === true && seg.tool !== 'eraser' && (shape === 'rect' || shape === 'ellipse');
    if (filled) ctx.fillStyle = seg.color || '#00f0ff';

    if (shape === 'rect') {
      const x = Math.min(fromX, toX);
      const y = Math.min(fromY, toY);
      const w = Math.abs(toX - fromX);
      const h = Math.abs(toY - fromY);
      ctx.beginPath();
      if (filled) ctx.fillRect(x, y, w, h);
      else ctx.strokeRect(x, y, w, h);
    } else if (shape === 'ellipse') {
      const cx = (fromX + toX) / 2;
      const cy = (fromY + toY) / 2;
      const rx = Math.abs(toX - fromX) / 2;
      const ry = Math.abs(toY - fromY) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      if (filled) ctx.fill();
      else ctx.stroke();
    } else if (shape === 'arrow' || shape === 'arrow2') {
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
      ctx.setLineDash([]);
      const headLen = Math.max(14, baseSize * 2.5) * scale;
      arrowHead(ctx, fromX, fromY, toX, toY, headLen);
      if (shape === 'arrow2') arrowHead(ctx, toX, toY, fromX, fromY, headLen);
    } else if (shape === 'text') {
      const text = typeof seg.text === 'string' ? seg.text.slice(0, MAX_TEXT) : '';
      if (text && seg.tool !== 'eraser') {
        ctx.fillStyle = seg.color || '#00f0ff';
        ctx.textBaseline = 'top';
        ctx.font = '700 ' + Math.round(Math.max(12, baseSize * 4) * scale) + 'px system-ui, -apple-system, sans-serif';
        ctx.fillText(text, fromX, fromY);
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
    }

    ctx.restore();
  }

  root.drawPizarraShape = drawPizarraShape;
  if (typeof module !== 'undefined' && module.exports) module.exports = { drawPizarraShape };
})(globalThis);
