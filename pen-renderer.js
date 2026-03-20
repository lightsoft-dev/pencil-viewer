/**
 * Pencil.dev .pen File Renderer v2
 * Full flexbox layout engine + proper sizing behaviors
 */

class PenRenderer {
    constructor() {
        this.document = null;
        this.variables = {};
        this.objects = new Map();
        this.selectedId = null;
        this._gradientDefs = [];
    }

    loadDocument(penData) {
        if (typeof penData === 'string') penData = JSON.parse(penData);
        this.document = penData;
        this.variables = penData.variables || {};
        this.objects.clear();
        this._gradientDefs = [];
        this._indexObjects(penData.children || []);
        return this;
    }

    _indexObjects(children) {
        for (const child of children) {
            if (child.id) this.objects.set(child.id, child);
            if (child.children) this._indexObjects(child.children);
        }
    }

    // ===== Variable Resolution =====
    resolveVar(value) {
        if (typeof value === 'string' && value.startsWith('$')) {
            const varName = value.slice(1);
            const varDef = this.variables[varName];
            if (varDef) {
                const val = Array.isArray(varDef.value) ? varDef.value[0].value : varDef.value;
                return this.resolveVar(val);
            }
            // Return a fallback for unresolved variables
            if (varName.includes('glass-bg')) return 'rgba(255,255,255,0.1)';
            if (varName.includes('glass-border')) return 'rgba(255,255,255,0.15)';
            if (varName.includes('text-secondary')) return 'rgba(255,255,255,0.7)';
            if (varName.includes('text-tertiary')) return 'rgba(255,255,255,0.5)';
            return 'rgba(128,128,128,0.5)';
        }
        return value;
    }

    resolveNum(value, fallback = 0) {
        if (typeof value === 'number') return value;
        const r = this.resolveVar(value);
        return typeof r === 'number' ? r : fallback;
    }

    // ===== Sizing =====
    /**
     * Resolve width/height for a node.
     * parentSize = available size from parent on that axis.
     */
    resolveSize(value, parentSize, axis = 'w') {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            if (value.startsWith('$')) {
                const r = this.resolveVar(value);
                if (typeof r === 'number') return r;
            }
            if (value === 'fill_container' || value.startsWith('fill_container')) {
                const match = /fill_container\((\d+)\)/.exec(value);
                return parentSize != null ? parentSize : (match ? parseInt(match[1]) : 100);
            }
            if (value === 'fit_content' || value.startsWith('fit_content')) {
                return null; // Will be computed after children
            }
            const num = parseFloat(value);
            if (!isNaN(num)) return num;
        }
        return null; // fit_content by default
    }

    // ===== Padding =====
    resolvePadding(padding) {
        if (padding == null) return { top: 0, right: 0, bottom: 0, left: 0 };
        if (typeof padding === 'number') return { top: padding, right: padding, bottom: padding, left: padding };
        const p = padding;
        if (typeof p === 'string') { const n = this.resolveNum(p); return { top: n, right: n, bottom: n, left: n }; }
        if (Array.isArray(p)) {
            if (p.length === 2) {
                const v = this.resolveNum(p[0]), h = this.resolveNum(p[1]);
                return { top: v, right: h, bottom: v, left: h };
            }
            if (p.length === 4) {
                return { top: this.resolveNum(p[0]), right: this.resolveNum(p[1]), bottom: this.resolveNum(p[2]), left: this.resolveNum(p[3]) };
            }
        }
        return { top: 0, right: 0, bottom: 0, left: 0 };
    }

    // ===== Fill =====
    resolveFill(fill) {
        if (!fill) return null;
        if (typeof fill === 'string') return this.resolveVar(fill);
        if (Array.isArray(fill)) {
            // Multiple fills — find last enabled one
            for (let i = fill.length - 1; i >= 0; i--) {
                if (fill[i].enabled !== false) return this.resolveFill(fill[i]);
            }
            return null;
        }
        if (fill.enabled === false) return null;
        if (fill.type === 'color') return this.resolveVar(fill.color);
        if (fill.type === 'gradient') return this._makeGradientId(fill);
        if (fill.type === 'image') {
            // Return image marker with URL for SVG <image> rendering
            return `__image__:${fill.url || ''}`;
        }
        return null;
    }

    _makeGradientId(fill) {
        const id = `grad-${this._gradientDefs.length}`;
        this._gradientDefs.push({ id, fill });
        return `url(#${id})`;
    }

    // ===== LAYOUT ENGINE =====
    /**
     * Perform layout on a tree of nodes.
     * Each node gets computed: _cx, _cy, _cw, _ch (computed x, y, width, height)
     */
    layoutTree(children, parentX, parentY, parentW, parentH) {
        for (const child of children) {
            // Top-level nodes use their own x, y
            child._cx = (child.x || 0);
            child._cy = (child.y || 0);
            const w = this.resolveSize(child.width, null, 'w');
            const h = this.resolveSize(child.height, null, 'h');
            child._cw = w || 100;
            child._ch = h || 100;

            if (child.children && child.children.length > 0) {
                this._layoutFrame(child);
            }
        }
    }

    _layoutFrame(node) {
        const layout = node.layout || (node.type === 'frame' ? 'horizontal' : 'none');
        const padding = this.resolvePadding(node.padding);
        const gap = this.resolveNum(node.gap);
        const isVertical = layout === 'vertical';
        const isHorizontal = layout === 'horizontal';
        const isNone = layout === 'none';

        const availW = node._cw - padding.left - padding.right;
        const availH = node._ch - padding.top - padding.bottom;

        const children = node.children || [];
        if (children.length === 0) return;

        if (isNone) {
            // Absolute positioning
            for (const child of children) {
                child._cx = (child.x || 0);
                child._cy = (child.y || 0);
                const cw = this.resolveSize(child.width, availW, 'w');
                const ch = this.resolveSize(child.height, availH, 'h');
                child._cw = cw || this._measureFitWidth(child, availW);
                child._ch = ch || this._measureFitHeight(child, availH);
                if (child.children) this._layoutFrame(child);
            }
            return;
        }

        // First pass: resolve fixed sizes and mark fill_container children
        const mainAxis = isVertical ? 'h' : 'w';
        const crossAxis = isVertical ? 'w' : 'h';
        const mainAvail = isVertical ? availH : availW;
        const crossAvail = isVertical ? availW : availH;

        let fixedMainTotal = 0;
        let fillCount = 0;
        const childInfos = [];

        for (const child of children) {
            const mainProp = isVertical ? child.height : child.width;
            const crossProp = isVertical ? child.width : child.height;
            const isFillMain = typeof mainProp === 'string' && mainProp.startsWith('fill_container');
            const isFillCross = typeof crossProp === 'string' && crossProp.startsWith('fill_container');
            const isFitMain = mainProp == null || (typeof mainProp === 'string' && mainProp.startsWith('fit_content'));

            let mainSize = isFillMain ? null : this.resolveSize(mainProp, mainAvail, mainAxis);
            let crossSize = isFillCross ? crossAvail : this.resolveSize(crossProp, crossAvail, crossAxis);

            if (crossSize == null) crossSize = this._measureFitCross(child, crossAvail, isVertical);

            // Estimate fit_content main size
            if (isFitMain && mainSize == null) {
                mainSize = this._measureFitMain(child, crossSize || crossAvail, isVertical);
            }

            const info = { child, mainSize, crossSize, isFillMain };
            childInfos.push(info);

            if (isFillMain) fillCount++;
            else fixedMainTotal += (mainSize || 0);
        }

        // Gap total
        const totalGap = gap * Math.max(0, children.length - 1);
        const remainingMain = Math.max(0, mainAvail - fixedMainTotal - totalGap);
        const fillSize = fillCount > 0 ? remainingMain / fillCount : 0;

        // Assign fill sizes
        for (const info of childInfos) {
            if (info.isFillMain) info.mainSize = fillSize;
        }

        // Second pass: position children
        let cursor = 0; // position along main axis

        // justifyContent
        const jc = node.justifyContent || 'start';
        const totalChildMain = childInfos.reduce((s, i) => s + (i.mainSize || 0), 0) + totalGap;
        if (jc === 'center') cursor = (mainAvail - totalChildMain) / 2;
        else if (jc === 'end') cursor = mainAvail - totalChildMain;
        else if (jc === 'space_between' && children.length > 1) {
            const spaceBetween = (mainAvail - childInfos.reduce((s, i) => s + (i.mainSize || 0), 0)) / (children.length - 1);
            let pos = 0;
            for (let i = 0; i < childInfos.length; i++) {
                const info = childInfos[i];
                const child = info.child;
                const ms = info.mainSize || 0;
                const cs = info.crossSize ?? crossAvail;

                // Cross axis alignment
                const crossOffset = this._alignCross(cs, crossAvail, node.alignItems);

                if (isVertical) {
                    child._cx = padding.left + crossOffset;
                    child._cy = padding.top + pos;
                    child._cw = cs;
                    child._ch = ms;
                } else {
                    child._cx = padding.left + pos;
                    child._cy = padding.top + crossOffset;
                    child._cw = ms;
                    child._ch = cs;
                }

                pos += ms + spaceBetween;
                if (child.children) this._layoutFrame(child);
            }
            return;
        }
        else if (jc === 'space_around' && children.length > 0) {
            const spaceAround = (mainAvail - childInfos.reduce((s, i) => s + (i.mainSize || 0), 0)) / (children.length * 2);
            cursor = spaceAround;
        }

        for (let i = 0; i < childInfos.length; i++) {
            const info = childInfos[i];
            const child = info.child;
            const ms = info.mainSize || 0;
            const cs = info.crossSize ?? crossAvail;

            const crossOffset = this._alignCross(cs, crossAvail, node.alignItems);

            if (isVertical) {
                child._cx = padding.left + crossOffset;
                child._cy = padding.top + cursor;
                child._cw = cs;
                child._ch = ms;
            } else {
                child._cx = padding.left + cursor;
                child._cy = padding.top + crossOffset;
                child._cw = ms;
                child._ch = cs;
            }

            cursor += ms + gap;
            if (child.children) this._layoutFrame(child);
        }
    }

    _alignCross(childSize, parentSize, alignItems) {
        if (!alignItems || alignItems === 'start') return 0;
        if (alignItems === 'center') return (parentSize - childSize) / 2;
        if (alignItems === 'end') return parentSize - childSize;
        return 0;
    }

    _measureFitWidth(node, available) {
        if (!node.children || node.children.length === 0) {
            if (node.type === 'text') return this._estimateTextWidth(node);
            return 0;
        }
        // Sum children widths (rough estimation)
        const padding = this.resolvePadding(node.padding);
        const gap = this.resolveNum(node.gap);
        const layout = node.layout || 'horizontal';
        let total = padding.left + padding.right;
        if (layout === 'horizontal') {
            for (const c of node.children) {
                const w = this.resolveSize(c.width, available, 'w') || this._measureFitWidth(c, available);
                total += w;
            }
            total += gap * Math.max(0, node.children.length - 1);
        } else {
            let maxW = 0;
            for (const c of node.children) {
                const w = this.resolveSize(c.width, available, 'w') || this._measureFitWidth(c, available);
                maxW = Math.max(maxW, w);
            }
            total += maxW;
        }
        return total;
    }

    _measureFitHeight(node, available) {
        if (!node.children || node.children.length === 0) {
            if (node.type === 'text') return this.resolveNum(node.fontSize, 14) * 1.4;
            return 0;
        }
        const padding = this.resolvePadding(node.padding);
        const gap = this.resolveNum(node.gap);
        const layout = node.layout || 'horizontal';
        let total = padding.top + padding.bottom;
        if (layout === 'vertical') {
            for (const c of node.children) {
                const h = this.resolveSize(c.height, available, 'h') || this._measureFitHeight(c, available);
                total += h;
            }
            total += gap * Math.max(0, node.children.length - 1);
        } else {
            let maxH = 0;
            for (const c of node.children) {
                const h = this.resolveSize(c.height, available, 'h') || this._measureFitHeight(c, available);
                maxH = Math.max(maxH, h);
            }
            total += maxH;
        }
        return total;
    }

    _measureFitMain(child, crossSize, isVertical) {
        return isVertical ? this._measureFitHeight(child, crossSize) : this._measureFitWidth(child, crossSize);
    }

    _measureFitCross(child, crossAvail, isVertical) {
        return isVertical ? this._measureFitWidth(child, crossAvail) : this._measureFitHeight(child, crossAvail);
    }

    _estimateTextWidth(node) {
        const content = typeof node.content === 'string' ? node.content : '';
        const fontSize = this.resolveNum(node.fontSize, 14);
        return content.length * fontSize * 0.6;
    }

    // ===== SVG RENDERING =====
    renderToSVG(svgGroup) {
        if (!this.document?.children) return;
        svgGroup.innerHTML = '';
        this._gradientDefs = [];
        this._shadowFilters = [];

        // Run layout
        this.layoutTree(this.document.children, 0, 0, Infinity, Infinity);

        // Render
        const ns = 'http://www.w3.org/2000/svg';
        for (const child of this.document.children) {
            const el = this._renderNode(child, child._cx, child._cy);
            if (el) svgGroup.appendChild(el);
        }

        // Add gradient and shadow filter defs BEFORE content
        if (this._gradientDefs.length > 0 || this._shadowFilters.length > 0) {
            const defs = document.createElementNS(ns, 'defs');
            for (const gd of this._gradientDefs) {
                defs.appendChild(this._createGradientElement(gd));
            }
            for (const sf of this._shadowFilters) {
                defs.appendChild(sf);
            }
            svgGroup.insertBefore(defs, svgGroup.firstChild);
        }

        return this._calculateBounds(this.document.children);
    }

    _createGradientElement(gd) {
        const ns = 'http://www.w3.org/2000/svg';
        const fill = gd.fill;
        const rotation = this.resolveNum(fill.rotation, 180);

        if (fill.gradientType === 'radial') {
            const grad = document.createElementNS(ns, 'radialGradient');
            grad.setAttribute('id', gd.id);
            if (fill.colors) {
                for (const c of fill.colors) {
                    const stop = document.createElementNS(ns, 'stop');
                    stop.setAttribute('offset', `${(this.resolveNum(c.position) * 100)}%`);
                    stop.setAttribute('stop-color', this.resolveVar(c.color));
                    grad.appendChild(stop);
                }
            }
            return grad;
        }

        const grad = document.createElementNS(ns, 'linearGradient');
        grad.setAttribute('id', gd.id);
        // Convert rotation to x1,y1,x2,y2
        const rad = ((rotation - 90) * Math.PI) / 180;
        const x1 = 0.5 - Math.cos(rad) * 0.5;
        const y1 = 0.5 - Math.sin(rad) * 0.5;
        const x2 = 0.5 + Math.cos(rad) * 0.5;
        const y2 = 0.5 + Math.sin(rad) * 0.5;
        grad.setAttribute('x1', x1);
        grad.setAttribute('y1', y1);
        grad.setAttribute('x2', x2);
        grad.setAttribute('y2', y2);

        if (fill.colors) {
            for (const c of fill.colors) {
                const stop = document.createElementNS(ns, 'stop');
                stop.setAttribute('offset', `${(this.resolveNum(c.position) * 100)}%`);
                stop.setAttribute('stop-color', this.resolveVar(c.color));
                grad.appendChild(stop);
            }
        }
        return grad;
    }

    _renderNode(node, absX, absY) {
        if (!node || node.enabled === false) return null;
        switch (node.type) {
            case 'frame': return this._renderFrame(node, absX, absY);
            case 'rectangle': return this._renderRect(node, absX, absY);
            case 'ellipse': return this._renderEllipse(node, absX, absY);
            case 'text': return this._renderText(node, absX, absY);
            case 'path': return this._renderPath(node, absX, absY);
            case 'polygon': return this._renderPolygon(node, absX, absY);
            case 'line': return this._renderLine(node, absX, absY);
            case 'icon_font': return this._renderIcon(node, absX, absY);
            case 'group': return this._renderGroup(node, absX, absY);
            case 'ref': return this._renderRef(node, absX, absY);
            default: return this._renderRect(node, absX, absY);
        }
    }

    _applyCommon(el, node) {
        el.setAttribute('data-pen-id', node.id || '');
        el.classList.add('pen-object');
        if (node.opacity != null && node.opacity !== 1) {
            el.setAttribute('opacity', this.resolveNum(node.opacity, 1));
        }
    }

    _svgRect(x, y, w, h, fill, cr, stroke) {
        const ns = 'http://www.w3.org/2000/svg';
        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', Math.max(0, w));
        rect.setAttribute('height', Math.max(0, h));
        if (fill && typeof fill === 'string' && fill.startsWith('__image__:')) {
            rect.setAttribute('fill', 'transparent');
        } else if (fill) rect.setAttribute('fill', fill);
        else rect.setAttribute('fill', 'transparent');
        if (cr) {
            const r = typeof cr === 'number' ? cr : (Array.isArray(cr) ? this.resolveNum(cr[0]) : this.resolveNum(cr));
            if (r) { rect.setAttribute('rx', r); rect.setAttribute('ry', r); }
        }
        if (stroke) {
            const sf = this.resolveFill(stroke.fill);
            if (sf && sf !== 'transparent') {
                rect.setAttribute('stroke', sf);
                rect.setAttribute('stroke-width', this.resolveNum(stroke.thickness, 1));
            }
        }
        return rect;
    }

    _renderFrame(node, absX, absY) {
        const ns = 'http://www.w3.org/2000/svg';
        const g = document.createElementNS(ns, 'g');
        this._applyCommon(g, node);

        const w = node._cw || 0;
        const h = node._ch || 0;

        // Background
        const fill = this.resolveFill(node.fill);
        const isImageFill = typeof fill === 'string' && fill.startsWith('__image__:');

        if (isImageFill) {
            // Render actual image with clip mask for corner radius
            const imageUrl = fill.replace('__image__:', '');
            const cr = node.cornerRadius;

            if (cr) {
                const imgClipId = `img-clip-${node.id}`;
                const defs = document.createElementNS(ns, 'defs');
                const cp = document.createElementNS(ns, 'clipPath');
                cp.setAttribute('id', imgClipId);
                const clipRect = this._svgRect(absX, absY, w, h, 'white', cr);
                cp.appendChild(clipRect);
                defs.appendChild(cp);
                g.appendChild(defs);

                const imgG = document.createElementNS(ns, 'g');
                imgG.setAttribute('clip-path', `url(#${imgClipId})`);
                const img = document.createElementNS(ns, 'image');
                img.setAttribute('href', imageUrl);
                img.setAttribute('x', absX);
                img.setAttribute('y', absY);
                img.setAttribute('width', w);
                img.setAttribute('height', h);
                img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
                imgG.appendChild(img);
                g.appendChild(imgG);
            } else {
                const img = document.createElementNS(ns, 'image');
                img.setAttribute('href', imageUrl);
                img.setAttribute('x', absX);
                img.setAttribute('y', absY);
                img.setAttribute('width', w);
                img.setAttribute('height', h);
                img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
                g.appendChild(img);
            }

            // Add stroke if any
            if (node.stroke) {
                const strokeRect = this._svgRect(absX, absY, w, h, 'transparent', cr, node.stroke);
                g.appendChild(strokeRect);
            }
        } else {
            const bg = this._svgRect(absX, absY, w, h, fill, node.cornerRadius, node.stroke);
            g.appendChild(bg);
        }

        // Clip
        if (node.clip) {
            const clipId = `clip-${node.id}`;
            const defs = document.createElementNS(ns, 'defs');
            const cp = document.createElementNS(ns, 'clipPath');
            cp.setAttribute('id', clipId);
            const cr = this._svgRect(absX, absY, w, h, 'white', node.cornerRadius);
            cp.appendChild(cr);
            defs.appendChild(cp);
            g.appendChild(defs);

            const contentG = document.createElementNS(ns, 'g');
            contentG.setAttribute('clip-path', `url(#${clipId})`);
            if (node.children) {
                for (const child of node.children) {
                    const cx = absX + (child._cx || 0);
                    const cy = absY + (child._cy || 0);
                    const el = this._renderNode(child, cx, cy);
                    if (el) contentG.appendChild(el);
                }
            }
            g.appendChild(contentG);
        } else if (node.children) {
            for (const child of node.children) {
                const cx = absX + (child._cx || 0);
                const cy = absY + (child._cy || 0);
                const el = this._renderNode(child, cx, cy);
                if (el) g.appendChild(el);
            }
        }

        // Shadow effect
        this._applyShadow(g, node);


        return g;
    }

    _renderRect(node, absX, absY) {
        const fill = this.resolveFill(node.fill);
        const rect = this._svgRect(absX, absY, node._cw || 0, node._ch || 0, fill, node.cornerRadius, node.stroke);
        this._applyCommon(rect, node);
        return rect;
    }

    _renderEllipse(node, absX, absY) {
        const ns = 'http://www.w3.org/2000/svg';
        const w = node._cw || 0;
        const h = node._ch || 0;
        const el = document.createElementNS(ns, 'ellipse');
        el.setAttribute('cx', absX + w / 2);
        el.setAttribute('cy', absY + h / 2);
        el.setAttribute('rx', w / 2);
        el.setAttribute('ry', h / 2);
        const fill = this.resolveFill(node.fill);
        el.setAttribute('fill', fill || 'transparent');
        this._applyCommon(el, node);
        return el;
    }

    _renderText(node, absX, absY) {
        const ns = 'http://www.w3.org/2000/svg';
        const text = document.createElementNS(ns, 'text');
        const fontSize = this.resolveNum(node.fontSize, 14);
        text.setAttribute('x', absX);
        text.setAttribute('y', absY + fontSize);
        text.setAttribute('font-family', this.resolveVar(node.fontFamily) || 'Inter, sans-serif');
        text.setAttribute('font-size', fontSize);
        text.setAttribute('font-weight', this.resolveVar(node.fontWeight) || '400');
        if (node.letterSpacing) text.setAttribute('letter-spacing', this.resolveNum(node.letterSpacing));

        const fill = this.resolveFill(node.fill);
        text.setAttribute('fill', fill || '#000');

        if (node.textAlign === 'center') {
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('x', absX + (node._cw || 0) / 2);
        } else if (node.textAlign === 'right') {
            text.setAttribute('text-anchor', 'end');
            text.setAttribute('x', absX + (node._cw || 0));
        }

        const content = node.content;
        if (typeof content === 'string') {
            // Handle multiline
            const lines = content.split('\n');
            if (lines.length > 1) {
                const lineHeight = fontSize * 1.4;
                text.textContent = '';
                lines.forEach((line, i) => {
                    const tspan = document.createElementNS(ns, 'tspan');
                    tspan.setAttribute('x', text.getAttribute('x'));
                    tspan.setAttribute('dy', i === 0 ? '0' : `${lineHeight}`);
                    tspan.textContent = line;
                    text.appendChild(tspan);
                });
            } else {
                text.textContent = this.resolveVar(content);
            }
        }

        this._applyCommon(text, node);
        return text;
    }

    _renderPath(node, absX, absY) {
        const ns = 'http://www.w3.org/2000/svg';
        const path = document.createElementNS(ns, 'path');
        if (node.geometry) path.setAttribute('d', node.geometry);
        path.setAttribute('transform', `translate(${absX}, ${absY})`);
        const fill = this.resolveFill(node.fill);
        path.setAttribute('fill', fill || 'transparent');
        if (node.fillRule) path.setAttribute('fill-rule', node.fillRule);
        this._applyCommon(path, node);
        return path;
    }

    _renderPolygon(node, absX, absY) {
        const ns = 'http://www.w3.org/2000/svg';
        const count = this.resolveNum(node.polygonCount, 6);
        const w = node._cw || 0, h = node._ch || 0;
        const cx = absX + w / 2, cy = absY + h / 2;
        let points = [];
        for (let i = 0; i < count; i++) {
            const a = (Math.PI * 2 * i) / count - Math.PI / 2;
            points.push(`${cx + (w / 2) * Math.cos(a)},${cy + (h / 2) * Math.sin(a)}`);
        }
        const el = document.createElementNS(ns, 'polygon');
        el.setAttribute('points', points.join(' '));
        el.setAttribute('fill', this.resolveFill(node.fill) || 'transparent');
        this._applyCommon(el, node);
        return el;
    }

    _renderLine(node, absX, absY) {
        const ns = 'http://www.w3.org/2000/svg';
        const el = document.createElementNS(ns, 'line');
        el.setAttribute('x1', absX);
        el.setAttribute('y1', absY);
        el.setAttribute('x2', absX + (node._cw || 0));
        el.setAttribute('y2', absY + (node._ch || 0));
        if (node.stroke) {
            el.setAttribute('stroke', this.resolveFill(node.stroke.fill) || '#999');
            el.setAttribute('stroke-width', this.resolveNum(node.stroke.thickness, 1));
        }
        this._applyCommon(el, node);
        return el;
    }

    // Built-in Lucide icon SVG paths
    static LUCIDE_ICONS = {
        'signal': 'M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16',
        'wifi': 'M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01',
        'battery-full': 'M6 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M22 11v2M6 7h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6V7zM10 10v4M14 10v4M7 10v4',
        'map-pin': 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
        'settings': 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
        'camera': 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
        'home': 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
        'calendar': 'M16 2v4M8 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
        'users': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
        'bar-chart-2': 'M18 20V10M12 20V4M6 20v-6',
        'sparkles': 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0zM20 3v4M22 5h-4M4 17v2M5 18H3',
        'sun': 'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
        'cloud': 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z',
        'cloud-rain': 'M16 13V5a2 2 0 0 0-2-2H6a4 4 0 0 0 0 8h10zm0 0l2.5 2.5M8 16v2m4-2v2m4-2v2',
        'thermometer': 'M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z',
        'droplets': 'M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05zM12.56 14.1c1.35 0 2.44-1.12 2.44-2.48 0-.72-.35-1.38-1.05-1.96-0.68-.55-1.17-1.33-1.39-2.16-.22.83-.71 1.61-1.39 2.16-.7.58-1.05 1.24-1.05 1.96 0 1.36 1.09 2.48 2.44 2.48z',
        'wind': 'M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2',
        'heart': 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
        'star': 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
        'message-circle': 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z',
        'share-2': 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98',
        'bell': 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M13.73 21a2 2 0 0 1-3.46 0',
        'search': 'M11 11m-8 0a8 8 0 1 0 16 0 8 8 0 1 0-16 0M21 21l-4.35-4.35',
        'plus': 'M12 5v14M5 12h14',
        'x': 'M18 6L6 18M6 6l12 12',
        'check': 'M20 6L9 17l-5-5',
        'chevron-right': 'M9 18l6-6-6-6',
        'chevron-left': 'M15 18l-6-6 6-6',
        'chevron-down': 'M6 9l6 6 6-6',
        'arrow-left': 'M19 12H5M12 19l-7-7 7-7',
        'moon': 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
        'edit': 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7',
        'trash': 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
        'eye': 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
        'refresh-cw': 'M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15',
        'book-open': 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
        'target': 'M12 12m-10 0a10 10 0 1 0 20 0 10 10 0 1 0-20 0M12 12m-6 0a6 6 0 1 0 12 0 6 6 0 1 0-12 0M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
        'award': 'M12 15l-3.45 2.04.92-3.98L6.1 10.08l4.03-.37L12 6l1.87 3.71 4.03.37-3.37 2.98.92 3.98z M8.21 13.89L7 23l5-3 5 3-1.21-9.12',
        'gift': 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
        'zap': 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
        'smile': 'M12 12m-10 0a10 10 0 1 0 20 0 10 10 0 1 0-20 0M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
        'frown': 'M12 12m-10 0a10 10 0 1 0 20 0 10 10 0 1 0-20 0M16 16s-1.5-2-4-2-4 2-4 2M9 9h.01M15 9h.01',
        'meh': 'M12 12m-10 0a10 10 0 1 0 20 0 10 10 0 1 0-20 0M8 15h8M9 9h.01M15 9h.01',
        'image': 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
        'lock': 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4',
        'palette': 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.5-4.5-9.95-10-9.99z M6.5 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M9.5 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M14.5 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M17.5 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
        'shirt': 'M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10h12V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z',
    };

    _renderIcon(node, absX, absY) {
        const ns = 'http://www.w3.org/2000/svg';
        const w = node._cw || 24, h = node._ch || 24;
        const iconName = this.resolveVar(node.iconFontName) || '';
        const fill = this.resolveFill(node.fill) || '#999';
        const pathData = PenRenderer.LUCIDE_ICONS[iconName];

        if (pathData) {
            const g = document.createElementNS(ns, 'g');
            this._applyCommon(g, node);
            // Scale to fit the node size
            const sx = w / 24, sy = h / 24;
            g.setAttribute('transform', `translate(${absX}, ${absY}) scale(${sx}, ${sy})`);
            // Split multiple paths
            const paths = pathData.split(/(?=[Mm](?=[A-Z0-9]))|(?<=z)\s*/i);
            // Actually render as single path with stroke style (Lucide uses strokes)
            const path = document.createElementNS(ns, 'path');
            path.setAttribute('d', pathData);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', fill);
            path.setAttribute('stroke-width', '2');
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            g.appendChild(path);
            return g;
        }

        // Fallback: render as a small circle with the first letter
        const g = document.createElementNS(ns, 'g');
        this._applyCommon(g, node);
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', absX + w / 2);
        circle.setAttribute('cy', absY + h / 2);
        circle.setAttribute('r', Math.min(w, h) / 3);
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', fill);
        circle.setAttribute('stroke-width', '1.5');
        g.appendChild(circle);
        return g;
    }

    _renderGroup(node, absX, absY) {
        const ns = 'http://www.w3.org/2000/svg';
        const g = document.createElementNS(ns, 'g');
        this._applyCommon(g, node);
        if (node.children) {
            for (const child of node.children) {
                const cx = absX + (child._cx || 0);
                const cy = absY + (child._cy || 0);
                const el = this._renderNode(child, cx, cy);
                if (el) g.appendChild(el);
            }
        }
        return g;
    }

    _renderRef(node, absX, absY) {
        const refId = node.ref;
        const original = this.objects.get(refId);
        if (!original) return null;
        const clone = JSON.parse(JSON.stringify(original));
        clone.id = node.id || clone.id;
        clone.name = node.name || clone.name;
        // Re-layout the clone at parent's position
        clone._cx = 0;
        clone._cy = 0;
        const w = this.resolveSize(clone.width, node._cw, 'w');
        const h = this.resolveSize(clone.height, node._ch, 'h');
        clone._cw = w || node._cw || 100;
        clone._ch = h || node._ch || 100;
        if (clone.children) this._layoutFrame(clone);
        if (node.descendants) this._applyOverrides(clone, node.descendants);
        return this._renderNode(clone, absX, absY);
    }

    _applyOverrides(node, descendants) {
        for (const [path, overrides] of Object.entries(descendants)) {
            const target = this._findDescendant(node, path);
            if (target) Object.assign(target, overrides);
        }
    }

    _findDescendant(node, idPath) {
        const parts = idPath.split('/');
        let current = node;
        for (const part of parts) {
            if (!current.children) return null;
            current = current.children.find(c => c.id === part);
            if (!current) return null;
        }
        return current;
    }

    _applyShadow(el, node) {
        if (!node.effect) return;
        const effects = Array.isArray(node.effect) ? node.effect : [node.effect];
        for (const eff of effects) {
            if (eff.type === 'shadow' && eff.shadowType !== 'inner' && eff.enabled !== false) {
                const blur = this.resolveNum(eff.blur, 4);
                const color = this.resolveVar(eff.color) || 'rgba(0,0,0,0.25)';
                const ox = eff.offset?.x || 0;
                const oy = eff.offset?.y || 2;
                // Use SVG native filter instead of CSS drop-shadow for performance
                const ns = 'http://www.w3.org/2000/svg';
                const filterId = `shadow-${this._gradientDefs.length}-${Math.random().toString(36).substr(2,4)}`;
                const filter = document.createElementNS(ns, 'filter');
                filter.setAttribute('id', filterId);
                filter.setAttribute('x', '-50%');
                filter.setAttribute('y', '-50%');
                filter.setAttribute('width', '200%');
                filter.setAttribute('height', '200%');
                const feOffset = document.createElementNS(ns, 'feOffset');
                feOffset.setAttribute('in', 'SourceAlpha');
                feOffset.setAttribute('dx', ox);
                feOffset.setAttribute('dy', oy);
                feOffset.setAttribute('result', 'offsetBlur');
                const feGaussian = document.createElementNS(ns, 'feGaussianBlur');
                feGaussian.setAttribute('in', 'offsetBlur');
                feGaussian.setAttribute('stdDeviation', blur / 2);
                feGaussian.setAttribute('result', 'blurred');
                const feFlood = document.createElementNS(ns, 'feFlood');
                feFlood.setAttribute('flood-color', color);
                feFlood.setAttribute('result', 'color');
                const feComposite = document.createElementNS(ns, 'feComposite');
                feComposite.setAttribute('in', 'color');
                feComposite.setAttribute('in2', 'blurred');
                feComposite.setAttribute('operator', 'in');
                feComposite.setAttribute('result', 'shadow');
                const feMerge = document.createElementNS(ns, 'feMerge');
                const feMergeNode1 = document.createElementNS(ns, 'feMergeNode');
                feMergeNode1.setAttribute('in', 'shadow');
                const feMergeNode2 = document.createElementNS(ns, 'feMergeNode');
                feMergeNode2.setAttribute('in', 'SourceGraphic');
                feMerge.appendChild(feMergeNode1);
                feMerge.appendChild(feMergeNode2);
                filter.appendChild(feOffset);
                filter.appendChild(feGaussian);
                filter.appendChild(feFlood);
                filter.appendChild(feComposite);
                filter.appendChild(feMerge);
                this._shadowFilters = this._shadowFilters || [];
                this._shadowFilters.push(filter);
                el.setAttribute('filter', `url(#${filterId})`);
                break;
            }
        }
    }

    _calculateBounds(children) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const c of children) {
            const x = c._cx ?? c.x ?? 0;
            const y = c._cy ?? c.y ?? 0;
            const w = c._cw || 100;
            const h = c._ch || 100;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w);
            maxY = Math.max(maxY, y + h);
        }
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    // ===== Layer Tree =====
    getLayerTree() {
        if (!this.document?.children) return [];
        return this._buildLayerTree(this.document.children);
    }

    _buildLayerTree(children) {
        const iconMap = {
            frame: 'crop_free', rectangle: 'rectangle', ellipse: 'circle',
            text: 'text_fields', group: 'folder', line: 'horizontal_rule',
            path: 'polyline', polygon: 'hexagon', icon_font: 'emoji_symbols',
            ref: 'link', note: 'sticky_note_2', prompt: 'smart_toy', context: 'info'
        };
        return children.map(c => ({
            id: c.id, name: c.name || c.id || c.type, type: c.type,
            icon: iconMap[c.type] || 'layers',
            children: c.children ? this._buildLayerTree(c.children) : null, data: c
        }));
    }

    getNodeProperties(nodeId) {
        const node = this.objects.get(nodeId);
        if (!node) return null;
        const props = {
            type: node.type, name: node.name || node.id,
            position: { x: node._cx || node.x || 0, y: node._cy || node.y || 0 },
            size: { width: node._cw || '—', height: node._ch || '—' },
            rotation: node.rotation || 0,
            opacity: node.opacity != null ? node.opacity : 1,
            fills: [], stroke: null, effects: [], typography: null
        };
        if (node.fill) {
            const fills = Array.isArray(node.fill) ? node.fill : [node.fill];
            props.fills = fills.map(f => ({ type: typeof f === 'string' ? 'color' : f.type || 'color', color: this.resolveFill(f) }));
        }
        if (node.stroke) props.stroke = { color: this.resolveFill(node.stroke.fill), thickness: node.stroke.thickness || 1 };
        if (node.type === 'text') {
            props.typography = {
                fontFamily: this.resolveVar(node.fontFamily) || 'Inter',
                fontSize: this.resolveNum(node.fontSize, 14),
                fontWeight: this.resolveVar(node.fontWeight) || '400',
                content: typeof node.content === 'string' ? node.content : ''
            };
        }
        return props;
    }
}

window.PenRenderer = PenRenderer;
