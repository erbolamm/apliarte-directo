// Shared renderer for drawing segments. The tablet (Pizarra Plus), the OBS
// transparent layer (/cristal) and the other drawing views all paint with this
// one function, so a shape looks the same everywhere.
//
// box: { width, height, scale, x?, y? } — the drawing area in CSS pixels and the
// stroke scale relative to the 1920x1080 reference.
(function (root) {
  'use strict';

  const SHAPES = ['stroke', 'rect', 'ellipse', 'diamond', 'star', 'cloud', 'bubble', 'arrow', 'arrow2', 'line', 'text'];
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
    const filled = seg.fill === true && seg.tool !== 'eraser' && (shape === 'rect' || shape === 'ellipse' || shape === 'diamond' || shape === 'star' || shape === 'cloud' || shape === 'bubble');
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
    } else if (shape === 'diamond') {
      const cx = (fromX + toX) / 2;
      const cy = (fromY + toY) / 2;
      ctx.beginPath();
      ctx.moveTo(cx, fromY);
      ctx.lineTo(toX, cy);
      ctx.lineTo(cx, toY);
      ctx.lineTo(fromX, cy);
      ctx.closePath();
      if (filled) ctx.fill();
      else ctx.stroke();
    } else if (shape === 'star') {
      const cx = (fromX + toX) / 2;
      const cy = (fromY + toY) / 2;
      const rx = Math.abs(toX - fromX) / 2;
      const ry = Math.abs(toY - fromY) / 2;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = i * Math.PI / 5 - Math.PI / 2;
        const rFactor = i % 2 === 0 ? 1 : 0.45;
        const px = cx + Math.cos(angle) * rx * rFactor;
        const py = cy + Math.sin(angle) * ry * rFactor;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      if (filled) ctx.fill();
      else ctx.stroke();
    } else if (shape === 'cloud') {
      const minX = Math.min(fromX, toX);
      const maxX = Math.max(fromX, toX);
      const minY = Math.min(fromY, toY);
      const maxY = Math.max(fromY, toY);
      const w = Math.max(2, maxX - minX);
      const h = Math.max(2, maxY - minY);
      ctx.beginPath();
      ctx.moveTo(minX + w * 0.2, maxY - h * 0.1);
      ctx.bezierCurveTo(minX - w * 0.05, maxY - h * 0.1, minX - w * 0.05, minY + h * 0.5, minX + w * 0.15, minY + h * 0.4);
      ctx.bezierCurveTo(minX + w * 0.05, minY, minX + w * 0.45, minY, minX + w * 0.5, minY + h * 0.2);
      ctx.bezierCurveTo(minX + w * 0.6, minY - h * 0.05, minX + w * 0.9, minY + h * 0.1, minX + w * 0.85, minY + h * 0.45);
      ctx.bezierCurveTo(maxX + w * 0.05, minY + h * 0.5, maxX + w * 0.05, maxY - h * 0.1, maxX - w * 0.2, maxY - h * 0.1);
      ctx.closePath();
      if (filled) ctx.fill();
      else ctx.stroke();
    } else if (shape === 'bubble') {
      const minX = Math.min(fromX, toX);
      const maxX = Math.max(fromX, toX);
      const minY = Math.min(fromY, toY);
      const maxY = Math.max(fromY, toY);
      const w = Math.max(2, maxX - minX);
      const h = Math.max(2, maxY - minY);
      const r = Math.min(w * 0.15, h * 0.15, 16);
      const bodyBottom = maxY - Math.min(h * 0.2, 20);
      ctx.beginPath();
      ctx.moveTo(minX + r, minY);
      ctx.lineTo(maxX - r, minY);
      ctx.quadraticCurveTo(maxX, minY, maxX, minY + r);
      ctx.lineTo(maxX, bodyBottom - r);
      ctx.quadraticCurveTo(maxX, bodyBottom, maxX - r, bodyBottom);
      ctx.lineTo(minX + w * 0.45, bodyBottom);
      ctx.lineTo(minX + w * 0.2, maxY);
      ctx.lineTo(minX + w * 0.25, bodyBottom);
      ctx.lineTo(minX + r, bodyBottom);
      ctx.quadraticCurveTo(minX, bodyBottom, minX, bodyBottom - r);
      ctx.lineTo(minX, minY + r);
      ctx.quadraticCurveTo(minX, minY, minX + r, minY);
      ctx.closePath();
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
