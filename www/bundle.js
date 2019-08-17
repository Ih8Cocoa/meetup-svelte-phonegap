var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function validate_store(store, name) {
        if (!store || typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, callback) {
        const unsub = store.subscribe(callback);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, fn) {
        return definition[1]
            ? assign({}, assign(ctx.$$scope.ctx, definition[1](fn ? fn(ctx) : {})))
            : ctx.$$scope.ctx;
    }
    function get_slot_changes(definition, ctx, changed, fn) {
        return definition[1]
            ? assign({}, assign(ctx.$$scope.changed || {}, definition[1](fn ? fn(changed) : {})))
            : ctx.$$scope.changed || {};
    }
    function null_to_empty(value) {
        return value == null ? '' : value;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    let running = false;
    function run_tasks() {
        tasks.forEach(task => {
            if (!task[0](now())) {
                tasks.delete(task);
                task[1]();
            }
        });
        running = tasks.size > 0;
        if (running)
            raf(run_tasks);
    }
    function loop(fn) {
        let task;
        if (!running) {
            running = true;
            raf(run_tasks);
        }
        return {
            promise: new Promise(fulfil => {
                tasks.add(task = [fn, fulfil]);
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let stylesheet;
    let active = 0;
    let current_rules = {};
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        if (!current_rules[name]) {
            if (!stylesheet) {
                const style = element('style');
                document.head.appendChild(style);
                stylesheet = style.sheet;
            }
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        node.style.animation = (node.style.animation || '')
            .split(', ')
            .filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        )
            .join(', ');
        if (name && !--active)
            clear_rules();
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            let i = stylesheet.cssRules.length;
            while (i--)
                stylesheet.deleteRule(i);
            current_rules = {};
        });
    }

    function create_animation(node, from, fn, params) {
        if (!from)
            return noop;
        const to = node.getBoundingClientRect();
        if (from.left === to.left && from.right === to.right && from.top === to.top && from.bottom === to.bottom)
            return noop;
        const { delay = 0, duration = 300, easing = identity, 
        // @ts-ignore todo: should this be separated from destructuring? Or start/end added to public api and documentation?
        start: start_time = now() + delay, 
        // @ts-ignore todo:
        end = start_time + duration, tick = noop, css } = fn(node, { from, to }, params);
        let running = true;
        let started = false;
        let name;
        function start() {
            if (css) {
                name = create_rule(node, 0, 1, duration, delay, easing, css);
            }
            if (!delay) {
                started = true;
            }
        }
        function stop() {
            if (css)
                delete_rule(node, name);
            running = false;
        }
        loop(now => {
            if (!started && now >= start_time) {
                started = true;
            }
            if (started && now >= end) {
                tick(1, 0);
                stop();
            }
            if (!running) {
                return false;
            }
            if (started) {
                const p = now - start_time;
                const t = 0 + 1 * easing(p / duration);
                tick(t, 1 - t);
            }
            return true;
        });
        start();
        tick(0, 1);
        return stop;
    }
    function fix_position(node) {
        const style = getComputedStyle(node);
        if (style.position !== 'absolute' && style.position !== 'fixed') {
            const { width, height } = style;
            const a = node.getBoundingClientRect();
            node.style.position = 'absolute';
            node.style.width = width;
            node.style.height = height;
            add_transform(node, a);
        }
    }
    function add_transform(node, a) {
        const b = node.getBoundingClientRect();
        if (a.left !== b.left || a.top !== b.top) {
            const style = getComputedStyle(node);
            const transform = style.transform === 'none' ? '' : style.transform;
            node.style.transform = `${transform} translate(${a.left - b.left}px, ${a.top - b.top}px)`;
        }
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    function createEventDispatcher() {
        const component = current_component;
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            callbacks.slice().forEach(fn => fn(event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment) {
            $$.update($$.dirty);
            run_all($$.before_update);
            $$.fragment.p($$.dirty, $$.ctx);
            $$.dirty = null;
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = program.b - t;
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }

    const globals = (typeof window !== 'undefined' ? window : global);
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function fix_and_outro_and_destroy_block(block, lookup) {
        block.f();
        outro_and_destroy_block(block, lookup);
    }
    function update_keyed_each(old_blocks, changed, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(changed, child_ctx);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }

    function bind(component, name, callback) {
        if (component.$$.props.indexOf(name) === -1)
            return;
        component.$$.bound[name] = callback;
        callback(component.$$.ctx[name]);
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        if (component.$$.fragment) {
            run_all(component.$$.on_destroy);
            component.$$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            component.$$.on_destroy = component.$$.fragment = null;
            component.$$.ctx = {};
        }
    }
    function make_dirty(component, key) {
        if (!component.$$.dirty) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty = blank_object();
        }
        component.$$.dirty[key] = true;
    }
    function init(component, options, instance, create_fragment, not_equal, prop_names) {
        const parent_component = current_component;
        set_current_component(component);
        const props = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props: prop_names,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty: null
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, props, (key, value) => {
                if ($$.ctx && not_equal($$.ctx[key], $$.ctx[key] = value)) {
                    if ($$.bound[key])
                        $$.bound[key](value);
                    if (ready)
                        make_dirty(component, key);
                }
            })
            : props;
        $$.update();
        ready = true;
        run_all($$.before_update);
        $$.fragment = create_fragment($$.ctx);
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    /* src/UI/Header.svelte generated by Svelte v3.7.1 */

    const file = "src/UI/Header.svelte";

    function create_fragment(ctx) {
    	var header, h1;

    	return {
    		c: function create() {
    			header = element("header");
    			h1 = element("h1");
    			h1.textContent = "Meet Us";
    			attr(h1, "class", "svelte-124g1px");
    			add_location(h1, file, 26, 1, 344);
    			attr(header, "class", "svelte-124g1px");
    			add_location(header, file, 25, 0, 334);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, header, anchor);
    			append(header, h1);
    		},

    		p: noop,
    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(header);
    			}
    		}
    	};
    }

    class Header extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, null, create_fragment, safe_not_equal, []);
    	}
    }

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function fade(node, { delay = 0, duration = 400 }) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            css: t => `opacity: ${t * o}`
        };
    }
    function fly(node, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
        };
    }
    function slide(node, { delay = 0, duration = 400, easing = cubicOut }) {
        const style = getComputedStyle(node);
        const opacity = +style.opacity;
        const height = parseFloat(style.height);
        const padding_top = parseFloat(style.paddingTop);
        const padding_bottom = parseFloat(style.paddingBottom);
        const margin_top = parseFloat(style.marginTop);
        const margin_bottom = parseFloat(style.marginBottom);
        const border_top_width = parseFloat(style.borderTopWidth);
        const border_bottom_width = parseFloat(style.borderBottomWidth);
        return {
            delay,
            duration,
            easing,
            css: t => `overflow: hidden;` +
                `opacity: ${Math.min(t * 20, 1) * opacity};` +
                `height: ${t * height}px;` +
                `padding-top: ${t * padding_top}px;` +
                `padding-bottom: ${t * padding_bottom}px;` +
                `margin-top: ${t * margin_top}px;` +
                `margin-bottom: ${t * margin_bottom}px;` +
                `border-top-width: ${t * border_top_width}px;` +
                `border-bottom-width: ${t * border_bottom_width}px;`
        };
    }
    function scale(node, { delay = 0, duration = 400, easing = cubicOut, start = 0, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const sd = 1 - start;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (_t, u) => `
			transform: ${transform} scale(${1 - (sd * u)});
			opacity: ${target_opacity - (od * u)}
		`
        };
    }

    function flip(node, animation, params) {
        const style = getComputedStyle(node);
        const transform = style.transform === 'none' ? '' : style.transform;
        const dx = animation.from.left - animation.to.left;
        const dy = animation.from.top - animation.to.top;
        const d = Math.sqrt(dx * dx + dy * dy);
        const { delay = 0, duration = d => Math.sqrt(d) * 120, easing = cubicOut } = params;
        return {
            delay,
            duration: is_function(duration) ? duration(d) : duration,
            easing,
            css: (_t, u) => `transform: ${transform} translate(${u * dx}px, ${u * dy}px);`
        };
    }

    /* src/UI/Button.svelte generated by Svelte v3.7.1 */

    const file$1 = "src/UI/Button.svelte";

    // (93:0) {:else}
    function create_else_block(ctx) {
    	var button, current, dispose;

    	const default_slot_template = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_template, ctx, null);

    	return {
    		c: function create() {
    			button = element("button");

    			if (default_slot) default_slot.c();

    			attr(button, "class", "" + null_to_empty(ctx.classes) + " svelte-tr0pnr");
    			attr(button, "type", ctx.type);
    			button.disabled = ctx.disabled;
    			add_location(button, file$1, 93, 1, 1454);
    			dispose = listen(button, "click", ctx.click_handler);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(button_nodes);
    		},

    		m: function mount(target, anchor) {
    			insert(target, button, anchor);

    			if (default_slot) {
    				default_slot.m(button, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(
    					get_slot_changes(default_slot_template, ctx, changed, null),
    					get_slot_context(default_slot_template, ctx, null)
    				);
    			}

    			if (!current || changed.classes) {
    				attr(button, "class", "" + null_to_empty(ctx.classes) + " svelte-tr0pnr");
    			}

    			if (!current || changed.type) {
    				attr(button, "type", ctx.type);
    			}

    			if (!current || changed.disabled) {
    				button.disabled = ctx.disabled;
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(button);
    			}

    			if (default_slot) default_slot.d(detaching);
    			dispose();
    		}
    	};
    }

    // (89:0) {#if href}
    function create_if_block(ctx) {
    	var a, current;

    	const default_slot_template = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_template, ctx, null);

    	return {
    		c: function create() {
    			a = element("a");

    			if (default_slot) default_slot.c();

    			attr(a, "href", ctx.href);
    			attr(a, "class", "svelte-tr0pnr");
    			add_location(a, file$1, 89, 1, 1417);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(a_nodes);
    		},

    		m: function mount(target, anchor) {
    			insert(target, a, anchor);

    			if (default_slot) {
    				default_slot.m(a, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(
    					get_slot_changes(default_slot_template, ctx, changed, null),
    					get_slot_context(default_slot_template, ctx, null)
    				);
    			}

    			if (!current || changed.href) {
    				attr(a, "href", ctx.href);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(a);
    			}

    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	var current_block_type_index, if_block, if_block_anchor, current;

    	var if_block_creators = [
    		create_if_block,
    		create_else_block
    	];

    	var if_blocks = [];

    	function select_block_type(ctx) {
    		if (ctx.href) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);
    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(changed, ctx);
    			} else {
    				group_outros();
    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});
    				check_outros();

    				if_block = if_blocks[current_block_type_index];
    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}
    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);

    			if (detaching) {
    				detach(if_block_anchor);
    			}
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { type = "button", href = "", mode = "", color = "", disabled = false } = $$props;

    	const writable_props = ['type', 'href', 'mode', 'color', 'disabled'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Button> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function click_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$set = $$props => {
    		if ('type' in $$props) $$invalidate('type', type = $$props.type);
    		if ('href' in $$props) $$invalidate('href', href = $$props.href);
    		if ('mode' in $$props) $$invalidate('mode', mode = $$props.mode);
    		if ('color' in $$props) $$invalidate('color', color = $$props.color);
    		if ('disabled' in $$props) $$invalidate('disabled', disabled = $$props.disabled);
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = ($$dirty = { mode: 1, color: 1 }) => {
    		if ($$dirty.mode || $$dirty.color) { $$invalidate('classes', classes = mode + (color ? " " + color : "")); }
    	};

    	return {
    		type,
    		href,
    		mode,
    		color,
    		disabled,
    		classes,
    		click_handler,
    		$$slots,
    		$$scope
    	};
    }

    class Button extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment$1, safe_not_equal, ["type", "href", "mode", "color", "disabled"]);
    	}

    	get type() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set type(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get href() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set href(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get mode() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set mode(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabled() {
    		throw new Error("<Button>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabled(value) {
    		throw new Error("<Button>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/UI/Badge.svelte generated by Svelte v3.7.1 */

    const file$2 = "src/UI/Badge.svelte";

    function create_fragment$2(ctx) {
    	var span, span_transition, current;

    	const default_slot_template = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_template, ctx, null);

    	return {
    		c: function create() {
    			span = element("span");

    			if (default_slot) default_slot.c();

    			attr(span, "class", "svelte-ksmq7q");
    			add_location(span, file$2, 18, 0, 306);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(span_nodes);
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, span, anchor);

    			if (default_slot) {
    				default_slot.m(span, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(
    					get_slot_changes(default_slot_template, ctx, changed, null),
    					get_slot_context(default_slot_template, ctx, null)
    				);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);

    			add_render_callback(() => {
    				if (!span_transition) span_transition = create_bidirectional_transition(span, slide, {}, true);
    				span_transition.run(1);
    			});

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);

    			if (!span_transition) span_transition = create_bidirectional_transition(span, slide, {}, false);
    			span_transition.run(0);

    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(span);
    			}

    			if (default_slot) default_slot.d(detaching);

    			if (detaching) {
    				if (span_transition) span_transition.end();
    			}
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	return { $$slots, $$scope };
    }

    class Badge extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$2, safe_not_equal, []);
    	}
    }

    /* src/UI/Spinner.svelte generated by Svelte v3.7.1 */

    const file$3 = "src/UI/Spinner.svelte";

    function create_fragment$3(ctx) {
    	var div5, div4, div0, div1, div2, div3;

    	return {
    		c: function create() {
    			div5 = element("div");
    			div4 = element("div");
    			div0 = element("div");
    			div1 = element("div");
    			div2 = element("div");
    			div3 = element("div");
    			attr(div0, "class", "svelte-1hhu72e");
    			add_location(div0, file$3, 46, 23, 903);
    			attr(div1, "class", "svelte-1hhu72e");
    			add_location(div1, file$3, 46, 34, 914);
    			attr(div2, "class", "svelte-1hhu72e");
    			add_location(div2, file$3, 46, 45, 925);
    			attr(div3, "class", "svelte-1hhu72e");
    			add_location(div3, file$3, 46, 56, 936);
    			attr(div4, "class", "lds-ring svelte-1hhu72e");
    			add_location(div4, file$3, 46, 1, 881);
    			attr(div5, "class", "loading svelte-1hhu72e");
    			add_location(div5, file$3, 45, 0, 858);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, div5, anchor);
    			append(div5, div4);
    			append(div4, div0);
    			append(div4, div1);
    			append(div4, div2);
    			append(div4, div3);
    		},

    		p: noop,
    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div5);
    			}
    		}
    	};
    }

    class Spinner extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, null, create_fragment$3, safe_not_equal, []);
    	}
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    // private store data, don't bother
    const _meetups = writable([]);

    // exposing a bunch of public methods
    const meetups = {
        subscribe: _meetups.subscribe,
        setMeetups: _meetups.set,
    	newMeetup: meetupData => {
    		_meetups.update(items => [meetupData, ...items]);
    	},
    	toggleFavorite: (id) => {
    		_meetups.update(items => {
    			const meetup = items.find(m => m.id === id);
    			if (meetup) {
    				meetup.isFavorite = !meetup.isFavorite;
    			}
    			return items;
    		});
    	},
    	editMeetup: (id, meetup) => {
    		_meetups.update(items => {
    			const meetupIndex = items.findIndex(m => m.id === id);
    			if (meetupIndex !== -1) {
    				items[meetupIndex] = meetup;
    			}
    			return items;
    		});
    	},
    	removeMeetup: (id) => {
    		_meetups.update(items => items.filter(m => m.id !== id));
    	}
    };

    /* src/Meetups/Item.svelte generated by Svelte v3.7.1 */
    const { Error: Error_1, console: console_1 } = globals;

    const file$4 = "src/Meetups/Item.svelte";

    // (104:3) {#if isFavorite}
    function create_if_block$1(ctx) {
    	var current;

    	var badge = new Badge({
    		props: {
    		$$slots: { default: [create_default_slot_4] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			badge.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(badge, target, anchor);
    			current = true;
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(badge.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(badge.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(badge, detaching);
    		}
    	};
    }

    // (105:4) <Badge>
    function create_default_slot_4(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("FAVORITE");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (118:2) <Button mode="outline" on:click={edit}>
    function create_default_slot_3(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Edit");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (119:2) <Button href="mailto:{contactEmail}">
    function create_default_slot_2(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Contact me");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (120:2) <Button    mode="outline"    disabled={isLoading}    color={isFavorite ? '' : 'success'}    on:click={toggleFavorite}>
    function create_default_slot_1(ctx) {
    	var t0_value = ctx.isFavorite ? 'Unf' : 'F', t0, t1;

    	return {
    		c: function create() {
    			t0 = text(t0_value);
    			t1 = text("avorite");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.isFavorite) && t0_value !== (t0_value = ctx.isFavorite ? 'Unf' : 'F')) {
    				set_data(t0, t0_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t0);
    				detach(t1);
    			}
    		}
    	};
    }

    // (127:2) <Button on:click={showDetails}>
    function create_default_slot(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Details");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    function create_fragment$4(ctx) {
    	var article, header, h1, t0, t1, t2, h2, t3, t4, p0, t5, t6, div0, img, img_alt_value, t7, div1, p1, t8, t9, footer, t10, t11, t12, current;

    	var if_block = (ctx.isFavorite) && create_if_block$1(ctx);

    	var button0 = new Button({
    		props: {
    		mode: "outline",
    		$$slots: { default: [create_default_slot_3] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});
    	button0.$on("click", ctx.edit);

    	var button1 = new Button({
    		props: {
    		href: "mailto:" + ctx.contactEmail,
    		$$slots: { default: [create_default_slot_2] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var button2 = new Button({
    		props: {
    		mode: "outline",
    		disabled: ctx.isLoading,
    		color: ctx.isFavorite ? '' : 'success',
    		$$slots: { default: [create_default_slot_1] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});
    	button2.$on("click", ctx.toggleFavorite);

    	var button3 = new Button({
    		props: {
    		$$slots: { default: [create_default_slot] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});
    	button3.$on("click", ctx.showDetails);

    	return {
    		c: function create() {
    			article = element("article");
    			header = element("header");
    			h1 = element("h1");
    			t0 = text(ctx.title);
    			t1 = space();
    			if (if_block) if_block.c();
    			t2 = space();
    			h2 = element("h2");
    			t3 = text(ctx.subtitle);
    			t4 = space();
    			p0 = element("p");
    			t5 = text(ctx.address);
    			t6 = space();
    			div0 = element("div");
    			img = element("img");
    			t7 = space();
    			div1 = element("div");
    			p1 = element("p");
    			t8 = text(ctx.description);
    			t9 = space();
    			footer = element("footer");
    			button0.$$.fragment.c();
    			t10 = space();
    			button1.$$.fragment.c();
    			t11 = space();
    			button2.$$.fragment.c();
    			t12 = space();
    			button3.$$.fragment.c();
    			attr(h1, "class", "svelte-1kx329u");
    			add_location(h1, file$4, 101, 2, 1655);
    			attr(h2, "class", "svelte-1kx329u");
    			add_location(h2, file$4, 107, 2, 1738);
    			attr(p0, "class", "svelte-1kx329u");
    			add_location(p0, file$4, 108, 2, 1760);
    			attr(header, "class", "svelte-1kx329u");
    			add_location(header, file$4, 100, 1, 1644);
    			attr(img, "src", ctx.imageUrl);
    			attr(img, "alt", img_alt_value = "alt image for " + ctx.title);
    			attr(img, "class", "svelte-1kx329u");
    			add_location(img, file$4, 111, 2, 1811);
    			attr(div0, "class", "image svelte-1kx329u");
    			add_location(div0, file$4, 110, 1, 1789);
    			attr(p1, "class", "svelte-1kx329u");
    			add_location(p1, file$4, 114, 2, 1895);
    			attr(div1, "class", "content svelte-1kx329u");
    			add_location(div1, file$4, 113, 1, 1871);
    			attr(footer, "class", "svelte-1kx329u");
    			add_location(footer, file$4, 116, 1, 1925);
    			attr(article, "class", "svelte-1kx329u");
    			add_location(article, file$4, 99, 0, 1633);
    		},

    		l: function claim(nodes) {
    			throw new Error_1("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, article, anchor);
    			append(article, header);
    			append(header, h1);
    			append(h1, t0);
    			append(h1, t1);
    			if (if_block) if_block.m(h1, null);
    			append(header, t2);
    			append(header, h2);
    			append(h2, t3);
    			append(header, t4);
    			append(header, p0);
    			append(p0, t5);
    			append(article, t6);
    			append(article, div0);
    			append(div0, img);
    			append(article, t7);
    			append(article, div1);
    			append(div1, p1);
    			append(p1, t8);
    			append(article, t9);
    			append(article, footer);
    			mount_component(button0, footer, null);
    			append(footer, t10);
    			mount_component(button1, footer, null);
    			append(footer, t11);
    			mount_component(button2, footer, null);
    			append(footer, t12);
    			mount_component(button3, footer, null);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (!current || changed.title) {
    				set_data(t0, ctx.title);
    			}

    			if (ctx.isFavorite) {
    				if (!if_block) {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(h1, null);
    				} else {
    									transition_in(if_block, 1);
    				}
    			} else if (if_block) {
    				group_outros();
    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});
    				check_outros();
    			}

    			if (!current || changed.subtitle) {
    				set_data(t3, ctx.subtitle);
    			}

    			if (!current || changed.address) {
    				set_data(t5, ctx.address);
    			}

    			if (!current || changed.imageUrl) {
    				attr(img, "src", ctx.imageUrl);
    			}

    			if ((!current || changed.title) && img_alt_value !== (img_alt_value = "alt image for " + ctx.title)) {
    				attr(img, "alt", img_alt_value);
    			}

    			if (!current || changed.description) {
    				set_data(t8, ctx.description);
    			}

    			var button0_changes = {};
    			if (changed.$$scope) button0_changes.$$scope = { changed, ctx };
    			button0.$set(button0_changes);

    			var button1_changes = {};
    			if (changed.contactEmail) button1_changes.href = "mailto:" + ctx.contactEmail;
    			if (changed.$$scope) button1_changes.$$scope = { changed, ctx };
    			button1.$set(button1_changes);

    			var button2_changes = {};
    			if (changed.isLoading) button2_changes.disabled = ctx.isLoading;
    			if (changed.isFavorite) button2_changes.color = ctx.isFavorite ? '' : 'success';
    			if (changed.$$scope || changed.isFavorite) button2_changes.$$scope = { changed, ctx };
    			button2.$set(button2_changes);

    			var button3_changes = {};
    			if (changed.$$scope) button3_changes.$$scope = { changed, ctx };
    			button3.$set(button3_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);

    			transition_in(button0.$$.fragment, local);

    			transition_in(button1.$$.fragment, local);

    			transition_in(button2.$$.fragment, local);

    			transition_in(button3.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(if_block);
    			transition_out(button0.$$.fragment, local);
    			transition_out(button1.$$.fragment, local);
    			transition_out(button2.$$.fragment, local);
    			transition_out(button3.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(article);
    			}

    			if (if_block) if_block.d();

    			destroy_component(button0);

    			destroy_component(button1);

    			destroy_component(button2);

    			destroy_component(button3);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	

    	let { title, id, subtitle, imageUrl, description, address, contactEmail, isFavorite = false } = $$props;

    	let isLoading = false;

    	const dispatch = createEventDispatcher();

    	function toggleFavorite() {
    		$$invalidate('isLoading', isLoading = true);
    		fetch(`https://svelte-test-store.firebaseio.com/meetups/${id}.json`, {
    				method: 'PATCH',
    				body: JSON.stringify({isFavorite: !isFavorite}),
    				headers: { 'Content-Type': 'application/json' }
    			})
    			.then(res => {
    				if (!res.ok) {
    					throw new Error("Can't change fav status")
    				}
    				meetups.toggleFavorite(id);
    			})
    			.catch(console.error)
    			.finally(() => {
    				$$invalidate('isLoading', isLoading = false);
    			});
    	}

    	function showDetails() {
    		dispatch("showdetails", id);
    	}

    	function edit() {
    		dispatch("edit", id);
    	}

    	const writable_props = ['title', 'id', 'subtitle', 'imageUrl', 'description', 'address', 'contactEmail', 'isFavorite'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console_1.warn(`<Item> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ('title' in $$props) $$invalidate('title', title = $$props.title);
    		if ('id' in $$props) $$invalidate('id', id = $$props.id);
    		if ('subtitle' in $$props) $$invalidate('subtitle', subtitle = $$props.subtitle);
    		if ('imageUrl' in $$props) $$invalidate('imageUrl', imageUrl = $$props.imageUrl);
    		if ('description' in $$props) $$invalidate('description', description = $$props.description);
    		if ('address' in $$props) $$invalidate('address', address = $$props.address);
    		if ('contactEmail' in $$props) $$invalidate('contactEmail', contactEmail = $$props.contactEmail);
    		if ('isFavorite' in $$props) $$invalidate('isFavorite', isFavorite = $$props.isFavorite);
    	};

    	return {
    		title,
    		id,
    		subtitle,
    		imageUrl,
    		description,
    		address,
    		contactEmail,
    		isFavorite,
    		isLoading,
    		toggleFavorite,
    		showDetails,
    		edit
    	};
    }

    class Item extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$4, safe_not_equal, ["title", "id", "subtitle", "imageUrl", "description", "address", "contactEmail", "isFavorite"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.title === undefined && !('title' in props)) {
    			console_1.warn("<Item> was created without expected prop 'title'");
    		}
    		if (ctx.id === undefined && !('id' in props)) {
    			console_1.warn("<Item> was created without expected prop 'id'");
    		}
    		if (ctx.subtitle === undefined && !('subtitle' in props)) {
    			console_1.warn("<Item> was created without expected prop 'subtitle'");
    		}
    		if (ctx.imageUrl === undefined && !('imageUrl' in props)) {
    			console_1.warn("<Item> was created without expected prop 'imageUrl'");
    		}
    		if (ctx.description === undefined && !('description' in props)) {
    			console_1.warn("<Item> was created without expected prop 'description'");
    		}
    		if (ctx.address === undefined && !('address' in props)) {
    			console_1.warn("<Item> was created without expected prop 'address'");
    		}
    		if (ctx.contactEmail === undefined && !('contactEmail' in props)) {
    			console_1.warn("<Item> was created without expected prop 'contactEmail'");
    		}
    	}

    	get title() {
    		throw new Error_1("<Item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error_1("<Item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get id() {
    		throw new Error_1("<Item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set id(value) {
    		throw new Error_1("<Item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get subtitle() {
    		throw new Error_1("<Item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set subtitle(value) {
    		throw new Error_1("<Item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get imageUrl() {
    		throw new Error_1("<Item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set imageUrl(value) {
    		throw new Error_1("<Item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get description() {
    		throw new Error_1("<Item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set description(value) {
    		throw new Error_1("<Item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get address() {
    		throw new Error_1("<Item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set address(value) {
    		throw new Error_1("<Item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get contactEmail() {
    		throw new Error_1("<Item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set contactEmail(value) {
    		throw new Error_1("<Item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isFavorite() {
    		throw new Error_1("<Item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isFavorite(value) {
    		throw new Error_1("<Item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/Meetups/Filter.svelte generated by Svelte v3.7.1 */

    const file$5 = "src/Meetups/Filter.svelte";

    function create_fragment$5(ctx) {
    	var div, button0, t_1, button1, dispose;

    	return {
    		c: function create() {
    			div = element("div");
    			button0 = element("button");
    			button0.textContent = "All";
    			t_1 = space();
    			button1 = element("button");
    			button1.textContent = "Favorites";
    			attr(button0, "type", "button");
    			attr(button0, "class", "svelte-192223y");
    			toggle_class(button0, "active", ctx.selectedButton === 0);
    			add_location(button0, file$5, 57, 1, 793);
    			attr(button1, "type", "button");
    			attr(button1, "class", "svelte-192223y");
    			toggle_class(button1, "active", ctx.selectedButton === 1);
    			add_location(button1, file$5, 63, 1, 897);
    			attr(div, "class", "svelte-192223y");
    			add_location(div, file$5, 56, 0, 786);

    			dispose = [
    				listen(button0, "click", ctx.filterAll),
    				listen(button1, "click", ctx.filterFavorites)
    			];
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);
    			append(div, button0);
    			append(div, t_1);
    			append(div, button1);
    		},

    		p: function update(changed, ctx) {
    			if (changed.selectedButton) {
    				toggle_class(button0, "active", ctx.selectedButton === 0);
    				toggle_class(button1, "active", ctx.selectedButton === 1);
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			run_all(dispose);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();

    	let selectedButton = 0;

    	function filterAll() {
    		switchButton(0);
    	}

    	function filterFavorites() {
    		switchButton(1);
    	}

    	function switchButton(number) {
    		$$invalidate('selectedButton', selectedButton = number);
    		dispatch("select", number);
    	}

    	return {
    		selectedButton,
    		filterAll,
    		filterFavorites
    	};
    }

    class Filter extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$5, safe_not_equal, []);
    	}
    }

    /* src/Meetups/Grid.svelte generated by Svelte v3.7.1 */

    const file$6 = "src/Meetups/Grid.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.meetup = list[i];
    	return child_ctx;
    }

    // (50:2) <Button on:click={edit}>
    function create_default_slot$1(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("New Meetup");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (59:1) {:else}
    function create_else_block$1(ctx) {
    	var p;

    	return {
    		c: function create() {
    			p = element("p");
    			p.textContent = "No Meetups found";
    			add_location(p, file$6, 59, 2, 1199);
    		},

    		m: function mount(target, anchor) {
    			insert(target, p, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(p);
    			}
    		}
    	};
    }

    // (55:1) {#each filteredMeetups as meetup (meetup.id)}
    function create_each_block(key_1, ctx) {
    	var div, t, div_transition, rect, stop_animation = noop, current;

    	var item_spread_levels = [
    		ctx.meetup
    	];

    	let item_props = {};
    	for (var i = 0; i < item_spread_levels.length; i += 1) {
    		item_props = assign(item_props, item_spread_levels[i]);
    	}
    	var item = new Item({ props: item_props, $$inline: true });
    	item.$on("showdetails", ctx.showdetails_handler);
    	item.$on("edit", ctx.edit_handler);

    	return {
    		key: key_1,

    		first: null,

    		c: function create() {
    			div = element("div");
    			item.$$.fragment.c();
    			t = space();
    			add_location(div, file$6, 55, 2, 1076);
    			this.first = div;
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);
    			mount_component(item, div, null);
    			append(div, t);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var item_changes = changed.filteredMeetups ? get_spread_update(item_spread_levels, [
    				ctx.meetup
    			]) : {};
    			item.$set(item_changes);
    		},

    		r: function measure_1() {
    			rect = div.getBoundingClientRect();
    		},

    		f: function fix() {
    			fix_position(div);
    			stop_animation();
    			add_transform(div, rect);
    		},

    		a: function animate() {
    			stop_animation();
    			stop_animation = create_animation(div, rect, flip, { duration: 200 });
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(item.$$.fragment, local);

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, scale, {}, true);
    				div_transition.run(1);
    			});

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(item.$$.fragment, local);

    			if (!div_transition) div_transition = create_bidirectional_transition(div, scale, {}, false);
    			div_transition.run(0);

    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			destroy_component(item);

    			if (detaching) {
    				if (div_transition) div_transition.end();
    			}
    		}
    	};
    }

    function create_fragment$6(ctx) {
    	var section0, t0, div, t1, section1, each_blocks = [], each_1_lookup = new Map(), current;

    	var filter = new Filter({ $$inline: true });
    	filter.$on("select", ctx.setFilter);

    	var button = new Button({
    		props: {
    		$$slots: { default: [create_default_slot$1] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});
    	button.$on("click", ctx.edit);

    	var each_value = ctx.filteredMeetups;

    	const get_key = ctx => ctx.meetup.id;

    	for (var i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	var each_1_else = null;

    	if (!each_value.length) {
    		each_1_else = create_else_block$1();
    		each_1_else.c();
    	}

    	return {
    		c: function create() {
    			section0 = element("section");
    			filter.$$.fragment.c();
    			t0 = space();
    			div = element("div");
    			button.$$.fragment.c();
    			t1 = space();
    			section1 = element("section");

    			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].c();
    			attr(div, "class", "meetup-control");
    			add_location(div, file$6, 48, 1, 909);
    			attr(section0, "id", "meetup-controls");
    			attr(section0, "class", "svelte-ojqwgy");
    			add_location(section0, file$6, 46, 0, 843);
    			attr(section1, "id", "meetups");
    			attr(section1, "class", "svelte-ojqwgy");
    			add_location(section1, file$6, 53, 0, 1004);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, section0, anchor);
    			mount_component(filter, section0, null);
    			append(section0, t0);
    			append(section0, div);
    			mount_component(button, div, null);
    			insert(target, t1, anchor);
    			insert(target, section1, anchor);

    			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].m(section1, null);

    			if (each_1_else) {
    				each_1_else.m(section1, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var button_changes = {};
    			if (changed.$$scope) button_changes.$$scope = { changed, ctx };
    			button.$set(button_changes);

    			const each_value = ctx.filteredMeetups;

    			group_outros();
    			for (let i = 0; i < each_blocks.length; i += 1) each_blocks[i].r();
    			each_blocks = update_keyed_each(each_blocks, changed, get_key, 1, ctx, each_value, each_1_lookup, section1, fix_and_outro_and_destroy_block, create_each_block, null, get_each_context);
    			for (let i = 0; i < each_blocks.length; i += 1) each_blocks[i].a();
    			check_outros();

    			if (each_value.length) {
    				if (each_1_else) {
    					each_1_else.d(1);
    					each_1_else = null;
    				}
    			} else if (!each_1_else) {
    				each_1_else = create_else_block$1();
    				each_1_else.c();
    				each_1_else.m(section1, null);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(filter.$$.fragment, local);

    			transition_in(button.$$.fragment, local);

    			for (var i = 0; i < each_value.length; i += 1) transition_in(each_blocks[i]);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(filter.$$.fragment, local);
    			transition_out(button.$$.fragment, local);

    			for (i = 0; i < each_blocks.length; i += 1) transition_out(each_blocks[i]);

    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(section0);
    			}

    			destroy_component(filter);

    			destroy_component(button);

    			if (detaching) {
    				detach(t1);
    				detach(section1);
    			}

    			for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].d();

    			if (each_1_else) each_1_else.d();
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	

    	let { meetups } = $$props;

    	const dispatch = createEventDispatcher();

    	let favsOnly = false;

    	function setFilter({ detail }) {
    		$$invalidate('favsOnly', favsOnly = detail === 1);
    	}

    	function edit() {
    		dispatch("edit");
    	}

    	const writable_props = ['meetups'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Grid> was created with unknown prop '${key}'`);
    	});

    	function showdetails_handler(event) {
    		bubble($$self, event);
    	}

    	function edit_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$set = $$props => {
    		if ('meetups' in $$props) $$invalidate('meetups', meetups = $$props.meetups);
    	};

    	let filteredMeetups;

    	$$self.$$.update = ($$dirty = { favsOnly: 1, meetups: 1 }) => {
    		if ($$dirty.favsOnly || $$dirty.meetups) { $$invalidate('filteredMeetups', filteredMeetups = favsOnly ? meetups.filter(m => m.isFavorite) : meetups); }
    	};

    	return {
    		meetups,
    		setFilter,
    		edit,
    		filteredMeetups,
    		showdetails_handler,
    		edit_handler
    	};
    }

    class Grid extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$6, safe_not_equal, ["meetups"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.meetups === undefined && !('meetups' in props)) {
    			console.warn("<Grid> was created without expected prop 'meetups'");
    		}
    	}

    	get meetups() {
    		throw new Error("<Grid>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set meetups(value) {
    		throw new Error("<Grid>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/UI/TextInput.svelte generated by Svelte v3.7.1 */

    const file$7 = "src/UI/TextInput.svelte";

    // (78:1) {:else}
    function create_else_block$2(ctx) {
    	var input, dispose;

    	return {
    		c: function create() {
    			input = element("input");
    			attr(input, "type", "text");
    			attr(input, "id", ctx.id);
    			attr(input, "class", "svelte-10j4da5");
    			toggle_class(input, "invalid", ctx.touchedAndInvalid);
    			add_location(input, file$7, 78, 2, 1262);

    			dispose = [
    				listen(input, "input", ctx.input_input_handler_1),
    				listen(input, "blur", ctx.touch)
    			];
    		},

    		m: function mount(target, anchor) {
    			insert(target, input, anchor);

    			input.value = ctx.value;
    		},

    		p: function update(changed, ctx) {
    			if (changed.value && (input.value !== ctx.value)) input.value = ctx.value;

    			if (changed.id) {
    				attr(input, "id", ctx.id);
    			}

    			if (changed.touchedAndInvalid) {
    				toggle_class(input, "invalid", ctx.touchedAndInvalid);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(input);
    			}

    			run_all(dispose);
    		}
    	};
    }

    // (71:33) 
    function create_if_block_2(ctx) {
    	var input, dispose;

    	return {
    		c: function create() {
    			input = element("input");
    			attr(input, "type", "email");
    			attr(input, "id", ctx.id);
    			attr(input, "class", "svelte-10j4da5");
    			toggle_class(input, "invalid", ctx.touchedAndInvalid);
    			add_location(input, file$7, 71, 2, 1147);

    			dispose = [
    				listen(input, "input", ctx.input_input_handler),
    				listen(input, "blur", ctx.touch)
    			];
    		},

    		m: function mount(target, anchor) {
    			insert(target, input, anchor);

    			input.value = ctx.value;
    		},

    		p: function update(changed, ctx) {
    			if (changed.value && (input.value !== ctx.value)) input.value = ctx.value;

    			if (changed.id) {
    				attr(input, "id", ctx.id);
    			}

    			if (changed.touchedAndInvalid) {
    				toggle_class(input, "invalid", ctx.touchedAndInvalid);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(input);
    			}

    			run_all(dispose);
    		}
    	};
    }

    // (64:1) {#if inputType === 'textarea'}
    function create_if_block_1(ctx) {
    	var textarea, dispose;

    	return {
    		c: function create() {
    			textarea = element("textarea");
    			attr(textarea, "rows", ctx.rows);
    			attr(textarea, "id", ctx.id);
    			attr(textarea, "class", "svelte-10j4da5");
    			toggle_class(textarea, "invalid", ctx.touchedAndInvalid);
    			add_location(textarea, file$7, 64, 2, 1010);

    			dispose = [
    				listen(textarea, "input", ctx.textarea_input_handler),
    				listen(textarea, "blur", ctx.touch)
    			];
    		},

    		m: function mount(target, anchor) {
    			insert(target, textarea, anchor);

    			textarea.value = ctx.value;
    		},

    		p: function update(changed, ctx) {
    			if (changed.value) textarea.value = ctx.value;

    			if (changed.rows) {
    				attr(textarea, "rows", ctx.rows);
    			}

    			if (changed.id) {
    				attr(textarea, "id", ctx.id);
    			}

    			if (changed.touchedAndInvalid) {
    				toggle_class(textarea, "invalid", ctx.touchedAndInvalid);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(textarea);
    			}

    			run_all(dispose);
    		}
    	};
    }

    // (87:1) {#if errorMessage && touchedAndInvalid}
    function create_if_block$2(ctx) {
    	var p, t;

    	return {
    		c: function create() {
    			p = element("p");
    			t = text(ctx.errorMessage);
    			attr(p, "class", "error-msg svelte-10j4da5");
    			add_location(p, file$7, 87, 2, 1416);
    		},

    		m: function mount(target, anchor) {
    			insert(target, p, anchor);
    			append(p, t);
    		},

    		p: function update(changed, ctx) {
    			if (changed.errorMessage) {
    				set_data(t, ctx.errorMessage);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(p);
    			}
    		}
    	};
    }

    function create_fragment$7(ctx) {
    	var div, label_1, t0, t1, t2;

    	function select_block_type(ctx) {
    		if (ctx.inputType === 'textarea') return create_if_block_1;
    		if (ctx.inputType === 'email') return create_if_block_2;
    		return create_else_block$2;
    	}

    	var current_block_type = select_block_type(ctx);
    	var if_block0 = current_block_type(ctx);

    	var if_block1 = (ctx.errorMessage && ctx.touchedAndInvalid) && create_if_block$2(ctx);

    	return {
    		c: function create() {
    			div = element("div");
    			label_1 = element("label");
    			t0 = text(ctx.label);
    			t1 = space();
    			if_block0.c();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			attr(label_1, "for", ctx.id);
    			attr(label_1, "class", "svelte-10j4da5");
    			add_location(label_1, file$7, 62, 1, 944);
    			attr(div, "class", "form-control svelte-10j4da5");
    			add_location(div, file$7, 61, 0, 916);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);
    			append(div, label_1);
    			append(label_1, t0);
    			append(div, t1);
    			if_block0.m(div, null);
    			append(div, t2);
    			if (if_block1) if_block1.m(div, null);
    		},

    		p: function update(changed, ctx) {
    			if (changed.label) {
    				set_data(t0, ctx.label);
    			}

    			if (changed.id) {
    				attr(label_1, "for", ctx.id);
    			}

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
    				if_block0.p(changed, ctx);
    			} else {
    				if_block0.d(1);
    				if_block0 = current_block_type(ctx);
    				if (if_block0) {
    					if_block0.c();
    					if_block0.m(div, t2);
    				}
    			}

    			if (ctx.errorMessage && ctx.touchedAndInvalid) {
    				if (if_block1) {
    					if_block1.p(changed, ctx);
    				} else {
    					if_block1 = create_if_block$2(ctx);
    					if_block1.c();
    					if_block1.m(div, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			if_block0.d();
    			if (if_block1) if_block1.d();
    		}
    	};
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { inputType = 0, id, label, rows = 0, value, errorMessage = "Please enter some data", isValid = true } = $$props;

    	let touched = false;

    	function touch() {
    		$$invalidate('touched', touched = true);
    	}

    	const writable_props = ['inputType', 'id', 'label', 'rows', 'value', 'errorMessage', 'isValid'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<TextInput> was created with unknown prop '${key}'`);
    	});

    	function textarea_input_handler() {
    		value = this.value;
    		$$invalidate('value', value);
    	}

    	function input_input_handler() {
    		value = this.value;
    		$$invalidate('value', value);
    	}

    	function input_input_handler_1() {
    		value = this.value;
    		$$invalidate('value', value);
    	}

    	$$self.$set = $$props => {
    		if ('inputType' in $$props) $$invalidate('inputType', inputType = $$props.inputType);
    		if ('id' in $$props) $$invalidate('id', id = $$props.id);
    		if ('label' in $$props) $$invalidate('label', label = $$props.label);
    		if ('rows' in $$props) $$invalidate('rows', rows = $$props.rows);
    		if ('value' in $$props) $$invalidate('value', value = $$props.value);
    		if ('errorMessage' in $$props) $$invalidate('errorMessage', errorMessage = $$props.errorMessage);
    		if ('isValid' in $$props) $$invalidate('isValid', isValid = $$props.isValid);
    	};

    	let touchedAndInvalid;

    	$$self.$$.update = ($$dirty = { isValid: 1, touched: 1 }) => {
    		if ($$dirty.isValid || $$dirty.touched) { $$invalidate('touchedAndInvalid', touchedAndInvalid = !isValid && touched); }
    	};

    	return {
    		inputType,
    		id,
    		label,
    		rows,
    		value,
    		errorMessage,
    		isValid,
    		touch,
    		touchedAndInvalid,
    		textarea_input_handler,
    		input_input_handler,
    		input_input_handler_1
    	};
    }

    class TextInput extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$7, safe_not_equal, ["inputType", "id", "label", "rows", "value", "errorMessage", "isValid"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.id === undefined && !('id' in props)) {
    			console.warn("<TextInput> was created without expected prop 'id'");
    		}
    		if (ctx.label === undefined && !('label' in props)) {
    			console.warn("<TextInput> was created without expected prop 'label'");
    		}
    		if (ctx.value === undefined && !('value' in props)) {
    			console.warn("<TextInput> was created without expected prop 'value'");
    		}
    	}

    	get inputType() {
    		throw new Error("<TextInput>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set inputType(value) {
    		throw new Error("<TextInput>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get id() {
    		throw new Error("<TextInput>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set id(value) {
    		throw new Error("<TextInput>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get label() {
    		throw new Error("<TextInput>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set label(value) {
    		throw new Error("<TextInput>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get rows() {
    		throw new Error("<TextInput>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set rows(value) {
    		throw new Error("<TextInput>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get value() {
    		throw new Error("<TextInput>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<TextInput>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get errorMessage() {
    		throw new Error("<TextInput>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set errorMessage(value) {
    		throw new Error("<TextInput>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isValid() {
    		throw new Error("<TextInput>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isValid(value) {
    		throw new Error("<TextInput>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/UI/Modal.svelte generated by Svelte v3.7.1 */

    const file$8 = "src/UI/Modal.svelte";

    const get_footer_slot_changes = () => ({});
    const get_footer_slot_context = () => ({});

    // (67:3) <Button on:click={closeModal}>
    function create_default_slot$2(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Close");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    function create_fragment$8(ctx) {
    	var div0, div0_transition, t0, div2, h1, t1, t2, div1, t3, footer, div2_transition, current, dispose;

    	const default_slot_template = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_template, ctx, null);

    	const footer_slot_template = ctx.$$slots.footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, get_footer_slot_context);

    	var button = new Button({
    		props: {
    		$$slots: { default: [create_default_slot$2] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});
    	button.$on("click", ctx.closeModal);

    	return {
    		c: function create() {
    			div0 = element("div");
    			t0 = space();
    			div2 = element("div");
    			h1 = element("h1");
    			t1 = text(ctx.title);
    			t2 = space();
    			div1 = element("div");

    			if (default_slot) default_slot.c();
    			t3 = space();
    			footer = element("footer");

    			if (!footer_slot) {
    				button.$$.fragment.c();
    			}

    			if (footer_slot) footer_slot.c();
    			attr(div0, "class", "modal-backdrop svelte-1p79soy");
    			add_location(div0, file$8, 55, 0, 872);
    			attr(h1, "class", "svelte-1p79soy");
    			add_location(h1, file$8, 59, 1, 1031);

    			attr(div1, "class", "content svelte-1p79soy");
    			add_location(div1, file$8, 60, 1, 1049);

    			attr(footer, "class", "svelte-1p79soy");
    			add_location(footer, file$8, 63, 1, 1091);
    			attr(div2, "class", "modal-content svelte-1p79soy");
    			add_location(div2, file$8, 58, 0, 974);
    			dispose = listen(div0, "click", ctx.closeModal);
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(div1_nodes);

    			if (footer_slot) footer_slot.l(footer_nodes);
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t0, anchor);
    			insert(target, div2, anchor);
    			append(div2, h1);
    			append(h1, t1);
    			append(div2, t2);
    			append(div2, div1);

    			if (default_slot) {
    				default_slot.m(div1, null);
    			}

    			append(div2, t3);
    			append(div2, footer);

    			if (!footer_slot) {
    				mount_component(button, footer, null);
    			}

    			else {
    				footer_slot.m(footer, null);
    			}

    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (!current || changed.title) {
    				set_data(t1, ctx.title);
    			}

    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(
    					get_slot_changes(default_slot_template, ctx, changed, null),
    					get_slot_context(default_slot_template, ctx, null)
    				);
    			}

    			if (!footer_slot) {
    				var button_changes = {};
    				if (changed.$$scope) button_changes.$$scope = { changed, ctx };
    				button.$set(button_changes);
    			}

    			if (footer_slot && footer_slot.p && changed.$$scope) {
    				footer_slot.p(
    					get_slot_changes(footer_slot_template, ctx, changed, get_footer_slot_changes),
    					get_slot_context(footer_slot_template, ctx, get_footer_slot_context)
    				);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			add_render_callback(() => {
    				if (!div0_transition) div0_transition = create_bidirectional_transition(div0, fade, {}, true);
    				div0_transition.run(1);
    			});

    			transition_in(default_slot, local);

    			transition_in(button.$$.fragment, local);

    			transition_in(footer_slot, local);

    			add_render_callback(() => {
    				if (!div2_transition) div2_transition = create_bidirectional_transition(div2, fly, { y: 300 }, true);
    				div2_transition.run(1);
    			});

    			current = true;
    		},

    		o: function outro(local) {
    			if (!div0_transition) div0_transition = create_bidirectional_transition(div0, fade, {}, false);
    			div0_transition.run(0);

    			transition_out(default_slot, local);
    			transition_out(button.$$.fragment, local);
    			transition_out(footer_slot, local);

    			if (!div2_transition) div2_transition = create_bidirectional_transition(div2, fly, { y: 300 }, false);
    			div2_transition.run(0);

    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div0);
    				if (div0_transition) div0_transition.end();
    				detach(t0);
    				detach(div2);
    			}

    			if (default_slot) default_slot.d(detaching);

    			if (!footer_slot) {
    				destroy_component(button);
    			}

    			if (footer_slot) footer_slot.d(detaching);

    			if (detaching) {
    				if (div2_transition) div2_transition.end();
    			}

    			dispose();
    		}
    	};
    }

    function instance$6($$self, $$props, $$invalidate) {
    	

    	let { title = "" } = $$props;

    	const dispatch = createEventDispatcher();

    	function closeModal() {
    		dispatch("close");
    	}

    	const writable_props = ['title'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Modal> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ('title' in $$props) $$invalidate('title', title = $$props.title);
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	return { title, closeModal, $$slots, $$scope };
    }

    class Modal extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$8, safe_not_equal, ["title"]);
    	}

    	get title() {
    		throw new Error("<Modal>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<Modal>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const isEmpty = (str) => str.trim().length === 0;

    const isEmail = (str) => !isEmpty(str) && /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(str);

    /* src/Meetups/EditMeetup.svelte generated by Svelte v3.7.1 */
    const { Error: Error_1$1, console: console_1$1 } = globals;

    const file$9 = "src/Meetups/EditMeetup.svelte";

    // (142:2) <Button mode="outline" on:click={close}>
    function create_default_slot_3$1(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Cancel");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (143:2) <Button on:click={submit} disabled={!validForm}>
    function create_default_slot_2$1(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Save");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (144:2) {#if id}
    function create_if_block$3(ctx) {
    	var current;

    	var button = new Button({
    		props: {
    		$$slots: { default: [create_default_slot_1$1] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});
    	button.$on("click", ctx.deleteMeetup);

    	return {
    		c: function create() {
    			button.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(button, target, anchor);
    			current = true;
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(button, detaching);
    		}
    	};
    }

    // (145:3) <Button on:click={deleteMeetup}>
    function create_default_slot_1$1(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Delete");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (141:1) <div slot="footer">
    function create_footer_slot(ctx) {
    	var div, t0, t1, current;

    	var button0 = new Button({
    		props: {
    		mode: "outline",
    		$$slots: { default: [create_default_slot_3$1] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});
    	button0.$on("click", ctx.close);

    	var button1 = new Button({
    		props: {
    		disabled: !ctx.validForm,
    		$$slots: { default: [create_default_slot_2$1] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});
    	button1.$on("click", ctx.submit);

    	var if_block = (ctx.id) && create_if_block$3(ctx);

    	return {
    		c: function create() {
    			div = element("div");
    			button0.$$.fragment.c();
    			t0 = space();
    			button1.$$.fragment.c();
    			t1 = space();
    			if (if_block) if_block.c();
    			attr(div, "slot", "footer");
    			add_location(div, file$9, 140, 1, 3220);
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);
    			mount_component(button0, div, null);
    			append(div, t0);
    			mount_component(button1, div, null);
    			append(div, t1);
    			if (if_block) if_block.m(div, null);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var button0_changes = {};
    			if (changed.$$scope) button0_changes.$$scope = { changed, ctx };
    			button0.$set(button0_changes);

    			var button1_changes = {};
    			if (changed.validForm) button1_changes.disabled = !ctx.validForm;
    			if (changed.$$scope) button1_changes.$$scope = { changed, ctx };
    			button1.$set(button1_changes);

    			if (ctx.id) {
    				if (!if_block) {
    					if_block = create_if_block$3(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div, null);
    				} else {
    									transition_in(if_block, 1);
    				}
    			} else if (if_block) {
    				group_outros();
    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});
    				check_outros();
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(button0.$$.fragment, local);

    			transition_in(button1.$$.fragment, local);

    			transition_in(if_block);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(button0.$$.fragment, local);
    			transition_out(button1.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			destroy_component(button0);

    			destroy_component(button1);

    			if (if_block) if_block.d();
    		}
    	};
    }

    // (103:0) <Modal title="Edit Meetup" on:close>
    function create_default_slot$3(ctx) {
    	var form, updating_value, t0, updating_value_1, t1, updating_value_2, t2, updating_value_3, t3, updating_value_4, t4, updating_value_5, t5, current, dispose;

    	function textinput0_value_binding(value) {
    		ctx.textinput0_value_binding.call(null, value);
    		updating_value = true;
    		add_flush_callback(() => updating_value = false);
    	}

    	let textinput0_props = {
    		id: "title",
    		label: "Title",
    		isValid: ctx.validTitle
    	};
    	if (ctx.meetup.title !== void 0) {
    		textinput0_props.value = ctx.meetup.title;
    	}
    	var textinput0 = new TextInput({ props: textinput0_props, $$inline: true });

    	binding_callbacks.push(() => bind(textinput0, 'value', textinput0_value_binding));

    	function textinput1_value_binding(value_1) {
    		ctx.textinput1_value_binding.call(null, value_1);
    		updating_value_1 = true;
    		add_flush_callback(() => updating_value_1 = false);
    	}

    	let textinput1_props = {
    		id: "subtitle",
    		label: "Subtitle",
    		isValid: ctx.validSubtitle
    	};
    	if (ctx.meetup.subtitle !== void 0) {
    		textinput1_props.value = ctx.meetup.subtitle;
    	}
    	var textinput1 = new TextInput({ props: textinput1_props, $$inline: true });

    	binding_callbacks.push(() => bind(textinput1, 'value', textinput1_value_binding));

    	function textinput2_value_binding(value_2) {
    		ctx.textinput2_value_binding.call(null, value_2);
    		updating_value_2 = true;
    		add_flush_callback(() => updating_value_2 = false);
    	}

    	let textinput2_props = {
    		id: "address",
    		label: "Address",
    		isValid: ctx.validAddress
    	};
    	if (ctx.meetup.address !== void 0) {
    		textinput2_props.value = ctx.meetup.address;
    	}
    	var textinput2 = new TextInput({ props: textinput2_props, $$inline: true });

    	binding_callbacks.push(() => bind(textinput2, 'value', textinput2_value_binding));

    	function textinput3_value_binding(value_3) {
    		ctx.textinput3_value_binding.call(null, value_3);
    		updating_value_3 = true;
    		add_flush_callback(() => updating_value_3 = false);
    	}

    	let textinput3_props = {
    		id: "imageUrl",
    		label: "Image URL",
    		isValid: ctx.validImage
    	};
    	if (ctx.meetup.imageUrl !== void 0) {
    		textinput3_props.value = ctx.meetup.imageUrl;
    	}
    	var textinput3 = new TextInput({ props: textinput3_props, $$inline: true });

    	binding_callbacks.push(() => bind(textinput3, 'value', textinput3_value_binding));

    	function textinput4_value_binding(value_4) {
    		ctx.textinput4_value_binding.call(null, value_4);
    		updating_value_4 = true;
    		add_flush_callback(() => updating_value_4 = false);
    	}

    	let textinput4_props = {
    		inputType: "email",
    		id: "email",
    		label: "Email",
    		isValid: ctx.validEmail,
    		errorMessage: "Please enter a valid email address"
    	};
    	if (ctx.meetup.contactEmail !== void 0) {
    		textinput4_props.value = ctx.meetup.contactEmail;
    	}
    	var textinput4 = new TextInput({ props: textinput4_props, $$inline: true });

    	binding_callbacks.push(() => bind(textinput4, 'value', textinput4_value_binding));

    	function textinput5_value_binding(value_5) {
    		ctx.textinput5_value_binding.call(null, value_5);
    		updating_value_5 = true;
    		add_flush_callback(() => updating_value_5 = false);
    	}

    	let textinput5_props = {
    		inputType: "textarea",
    		rows: "3",
    		id: "description",
    		label: "Description",
    		isValid: ctx.validDescription
    	};
    	if (ctx.meetup.description !== void 0) {
    		textinput5_props.value = ctx.meetup.description;
    	}
    	var textinput5 = new TextInput({ props: textinput5_props, $$inline: true });

    	binding_callbacks.push(() => bind(textinput5, 'value', textinput5_value_binding));

    	return {
    		c: function create() {
    			form = element("form");
    			textinput0.$$.fragment.c();
    			t0 = space();
    			textinput1.$$.fragment.c();
    			t1 = space();
    			textinput2.$$.fragment.c();
    			t2 = space();
    			textinput3.$$.fragment.c();
    			t3 = space();
    			textinput4.$$.fragment.c();
    			t4 = space();
    			textinput5.$$.fragment.c();
    			t5 = space();
    			attr(form, "class", "svelte-nm5p4o");
    			add_location(form, file$9, 104, 1, 2398);
    			dispose = listen(form, "submit", prevent_default(ctx.submit));
    		},

    		m: function mount(target, anchor) {
    			insert(target, form, anchor);
    			mount_component(textinput0, form, null);
    			append(form, t0);
    			mount_component(textinput1, form, null);
    			append(form, t1);
    			mount_component(textinput2, form, null);
    			append(form, t2);
    			mount_component(textinput3, form, null);
    			append(form, t3);
    			mount_component(textinput4, form, null);
    			append(form, t4);
    			mount_component(textinput5, form, null);
    			insert(target, t5, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var textinput0_changes = {};
    			if (changed.validTitle) textinput0_changes.isValid = ctx.validTitle;
    			if (!updating_value && changed.meetup) {
    				textinput0_changes.value = ctx.meetup.title;
    			}
    			textinput0.$set(textinput0_changes);

    			var textinput1_changes = {};
    			if (changed.validSubtitle) textinput1_changes.isValid = ctx.validSubtitle;
    			if (!updating_value_1 && changed.meetup) {
    				textinput1_changes.value = ctx.meetup.subtitle;
    			}
    			textinput1.$set(textinput1_changes);

    			var textinput2_changes = {};
    			if (changed.validAddress) textinput2_changes.isValid = ctx.validAddress;
    			if (!updating_value_2 && changed.meetup) {
    				textinput2_changes.value = ctx.meetup.address;
    			}
    			textinput2.$set(textinput2_changes);

    			var textinput3_changes = {};
    			if (changed.validImage) textinput3_changes.isValid = ctx.validImage;
    			if (!updating_value_3 && changed.meetup) {
    				textinput3_changes.value = ctx.meetup.imageUrl;
    			}
    			textinput3.$set(textinput3_changes);

    			var textinput4_changes = {};
    			if (changed.validEmail) textinput4_changes.isValid = ctx.validEmail;
    			if (!updating_value_4 && changed.meetup) {
    				textinput4_changes.value = ctx.meetup.contactEmail;
    			}
    			textinput4.$set(textinput4_changes);

    			var textinput5_changes = {};
    			if (changed.validDescription) textinput5_changes.isValid = ctx.validDescription;
    			if (!updating_value_5 && changed.meetup) {
    				textinput5_changes.value = ctx.meetup.description;
    			}
    			textinput5.$set(textinput5_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(textinput0.$$.fragment, local);

    			transition_in(textinput1.$$.fragment, local);

    			transition_in(textinput2.$$.fragment, local);

    			transition_in(textinput3.$$.fragment, local);

    			transition_in(textinput4.$$.fragment, local);

    			transition_in(textinput5.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(textinput0.$$.fragment, local);
    			transition_out(textinput1.$$.fragment, local);
    			transition_out(textinput2.$$.fragment, local);
    			transition_out(textinput3.$$.fragment, local);
    			transition_out(textinput4.$$.fragment, local);
    			transition_out(textinput5.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(form);
    			}

    			destroy_component(textinput0);

    			destroy_component(textinput1);

    			destroy_component(textinput2);

    			destroy_component(textinput3);

    			destroy_component(textinput4);

    			destroy_component(textinput5);

    			if (detaching) {
    				detach(t5);
    			}

    			dispose();
    		}
    	};
    }

    function create_fragment$9(ctx) {
    	var current;

    	var modal = new Modal({
    		props: {
    		title: "Edit Meetup",
    		$$slots: {
    		default: [create_default_slot$3],
    		footer: [create_footer_slot]
    	},
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});
    	modal.$on("close", ctx.close_handler);

    	return {
    		c: function create() {
    			modal.$$.fragment.c();
    		},

    		l: function claim(nodes) {
    			throw new Error_1$1("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			mount_component(modal, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var modal_changes = {};
    			if (changed.$$scope || changed.id || changed.validForm || changed.validDescription || changed.meetup || changed.validEmail || changed.validImage || changed.validAddress || changed.validSubtitle || changed.validTitle) modal_changes.$$scope = { changed, ctx };
    			modal.$set(modal_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(modal.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(modal.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(modal, detaching);
    		}
    	};
    }

    function instance$7($$self, $$props, $$invalidate) {
    	

    	let { id = null } = $$props;

    	let meetup = {
    		title: "",
    		subtitle: "",
    		contactEmail: "",
    		address: "",
    		description: "",
    		imageUrl: ""
    	};

    	if (id) {
    		// double call to unsub immediately
    		meetups.subscribe(items => {
    			$$invalidate('meetup', meetup = items.find(i => i.id === id));
    		})();
    	}

    	const dispatch = createEventDispatcher();

    	function close() {
    		dispatch("close");
    	}

    	function submit() {
    		if (id) {
    			fetch(`https://svelte-test-store.firebaseio.com/meetups/${id}.json`, {
    				method: 'PATCH',
    				// make a copy of the object without the ID attribute
    				body: JSON.stringify({...meetup, id: undefined}),
    				headers: { 'Content-Type': 'application/json' }
    			})
    				.then(res => {
    					if (!res.ok) {
    						throw new Error('oops');
    					}
    					meetups.editMeetup(id, meetup);
    				})
    				.catch(console.error);
    		} else {
    			const meetupWithFav = {...meetup, isFavorite: false};
    			fetch('https://svelte-test-store.firebaseio.com/meetups.json', {
    				method: 'POST',
    				body: JSON.stringify(meetupWithFav),
    				headers: { 'Content-Type': 'application/json' }
    			})
    			.then(res => {
    				if (!res.ok) {
    					throw new Error('Failed');
    				}
    				return res.json();
    			})
    			.then(json => meetups.newMeetup({...meetupWithFav, id: json.name}))
    			.catch(console.error);
    			
    		}
    		close();
    	}

    	function deleteMeetup() {
    		fetch(`https://svelte-test-store.firebaseio.com/meetups/${id}.json`, {
    				method: 'DELETE'
    			})
    			.then(res => {
    				if (!res.ok) {
    					throw new Error("Can't delete")
    				}
    				meetups.removeMeetup(id);
    			})
    			.catch(console.error);
    		close();
    	}

    	const writable_props = ['id'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console_1$1.warn(`<EditMeetup> was created with unknown prop '${key}'`);
    	});

    	function close_handler(event) {
    		bubble($$self, event);
    	}

    	function textinput0_value_binding(value) {
    		meetup.title = value;
    		$$invalidate('meetup', meetup);
    	}

    	function textinput1_value_binding(value_1) {
    		meetup.subtitle = value_1;
    		$$invalidate('meetup', meetup);
    	}

    	function textinput2_value_binding(value_2) {
    		meetup.address = value_2;
    		$$invalidate('meetup', meetup);
    	}

    	function textinput3_value_binding(value_3) {
    		meetup.imageUrl = value_3;
    		$$invalidate('meetup', meetup);
    	}

    	function textinput4_value_binding(value_4) {
    		meetup.contactEmail = value_4;
    		$$invalidate('meetup', meetup);
    	}

    	function textinput5_value_binding(value_5) {
    		meetup.description = value_5;
    		$$invalidate('meetup', meetup);
    	}

    	$$self.$set = $$props => {
    		if ('id' in $$props) $$invalidate('id', id = $$props.id);
    	};

    	let validTitle, validSubtitle, validAddress, validDescription, validImage, validEmail, validForm;

    	$$self.$$.update = ($$dirty = { meetup: 1, validTitle: 1, validSubtitle: 1, validAddress: 1, validDescription: 1, validImage: 1, validEmail: 1 }) => {
    		if ($$dirty.meetup) { $$invalidate('validTitle', validTitle = !isEmpty(meetup.title)); }
    		if ($$dirty.meetup) { $$invalidate('validSubtitle', validSubtitle = !isEmpty(meetup.subtitle)); }
    		if ($$dirty.meetup) { $$invalidate('validAddress', validAddress = !isEmpty(meetup.address)); }
    		if ($$dirty.meetup) { $$invalidate('validDescription', validDescription = !isEmpty(meetup.description)); }
    		if ($$dirty.meetup) { $$invalidate('validImage', validImage = !isEmpty(meetup.imageUrl)); }
    		if ($$dirty.meetup) { $$invalidate('validEmail', validEmail = isEmail(meetup.contactEmail)); }
    		if ($$dirty.validTitle || $$dirty.validSubtitle || $$dirty.validAddress || $$dirty.validDescription || $$dirty.validImage || $$dirty.validEmail) { $$invalidate('validForm', validForm =
    				validTitle &&
    				validSubtitle &&
    				validAddress & validDescription &&
    				validImage &&
    				validEmail); }
    	};

    	return {
    		id,
    		meetup,
    		close,
    		submit,
    		deleteMeetup,
    		validTitle,
    		validSubtitle,
    		validAddress,
    		validDescription,
    		validImage,
    		validEmail,
    		validForm,
    		close_handler,
    		textinput0_value_binding,
    		textinput1_value_binding,
    		textinput2_value_binding,
    		textinput3_value_binding,
    		textinput4_value_binding,
    		textinput5_value_binding
    	};
    }

    class EditMeetup extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$7, create_fragment$9, safe_not_equal, ["id"]);
    	}

    	get id() {
    		throw new Error_1$1("<EditMeetup>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set id(value) {
    		throw new Error_1$1("<EditMeetup>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/Meetups/Details.svelte generated by Svelte v3.7.1 */

    const file$a = "src/Meetups/Details.svelte";

    // (68:0) {#if details}
    function create_if_block$4(ctx) {
    	var section, div0, img, img_src_value, t0, div1, h1, t1_value = ctx.details.title, t1, t2, h2, t3_value = ctx.details.subtitle, t3, t4, t5_value = ctx.details.address, t5, t6, p, t7_value = ctx.details.description, t7, t8, t9, current;

    	var button0 = new Button({
    		props: {
    		href: "mailto:" + ctx.details.contactEmail,
    		$$slots: { default: [create_default_slot_1$2] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});

    	var button1 = new Button({
    		props: {
    		mode: "outline",
    		$$slots: { default: [create_default_slot$4] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});
    	button1.$on("click", ctx.close);

    	return {
    		c: function create() {
    			section = element("section");
    			div0 = element("div");
    			img = element("img");
    			t0 = space();
    			div1 = element("div");
    			h1 = element("h1");
    			t1 = text(t1_value);
    			t2 = space();
    			h2 = element("h2");
    			t3 = text(t3_value);
    			t4 = text(" - at ");
    			t5 = text(t5_value);
    			t6 = space();
    			p = element("p");
    			t7 = text(t7_value);
    			t8 = space();
    			button0.$$.fragment.c();
    			t9 = space();
    			button1.$$.fragment.c();
    			attr(img, "src", img_src_value = ctx.details.imageUrl);
    			attr(img, "alt", "useless pic");
    			attr(img, "class", "svelte-145ke85");
    			add_location(img, file$a, 70, 3, 1021);
    			attr(div0, "class", "image svelte-145ke85");
    			add_location(div0, file$a, 69, 2, 998);
    			attr(h1, "class", "svelte-145ke85");
    			add_location(h1, file$a, 73, 3, 1106);
    			attr(h2, "class", "svelte-145ke85");
    			add_location(h2, file$a, 74, 3, 1134);
    			attr(p, "class", "svelte-145ke85");
    			add_location(p, file$a, 75, 3, 1188);
    			attr(div1, "class", "content svelte-145ke85");
    			add_location(div1, file$a, 72, 2, 1081);
    			attr(section, "class", "svelte-145ke85");
    			add_location(section, file$a, 68, 1, 986);
    		},

    		m: function mount(target, anchor) {
    			insert(target, section, anchor);
    			append(section, div0);
    			append(div0, img);
    			append(section, t0);
    			append(section, div1);
    			append(div1, h1);
    			append(h1, t1);
    			append(div1, t2);
    			append(div1, h2);
    			append(h2, t3);
    			append(h2, t4);
    			append(h2, t5);
    			append(div1, t6);
    			append(div1, p);
    			append(p, t7);
    			append(div1, t8);
    			mount_component(button0, div1, null);
    			append(div1, t9);
    			mount_component(button1, div1, null);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if ((!current || changed.details) && img_src_value !== (img_src_value = ctx.details.imageUrl)) {
    				attr(img, "src", img_src_value);
    			}

    			if ((!current || changed.details) && t1_value !== (t1_value = ctx.details.title)) {
    				set_data(t1, t1_value);
    			}

    			if ((!current || changed.details) && t3_value !== (t3_value = ctx.details.subtitle)) {
    				set_data(t3, t3_value);
    			}

    			if ((!current || changed.details) && t5_value !== (t5_value = ctx.details.address)) {
    				set_data(t5, t5_value);
    			}

    			if ((!current || changed.details) && t7_value !== (t7_value = ctx.details.description)) {
    				set_data(t7, t7_value);
    			}

    			var button0_changes = {};
    			if (changed.details) button0_changes.href = "mailto:" + ctx.details.contactEmail;
    			if (changed.$$scope) button0_changes.$$scope = { changed, ctx };
    			button0.$set(button0_changes);

    			var button1_changes = {};
    			if (changed.$$scope) button1_changes.$$scope = { changed, ctx };
    			button1.$set(button1_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(button0.$$.fragment, local);

    			transition_in(button1.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(button0.$$.fragment, local);
    			transition_out(button1.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(section);
    			}

    			destroy_component(button0);

    			destroy_component(button1);
    		}
    	};
    }

    // (77:3) <Button href="mailto:{details.contactEmail}">
    function create_default_slot_1$2(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Contact pls");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    // (78:3) <Button mode="outline" on:click={close}>
    function create_default_slot$4(ctx) {
    	var t;

    	return {
    		c: function create() {
    			t = text("Close");
    		},

    		m: function mount(target, anchor) {
    			insert(target, t, anchor);
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(t);
    			}
    		}
    	};
    }

    function create_fragment$a(ctx) {
    	var if_block_anchor, current;

    	var if_block = (ctx.details) && create_if_block$4(ctx);

    	return {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (ctx.details) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    					transition_in(if_block, 1);
    				} else {
    					if_block = create_if_block$4(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();
    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});
    				check_outros();
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);

    			if (detaching) {
    				detach(if_block_anchor);
    			}
    		}
    	};
    }

    function instance$8($$self, $$props, $$invalidate) {
    	

    	let { id } = $$props;

    	const dispatch = createEventDispatcher();
    	let details;

    	// receive an unsub value. Call as a function to unsub
    	const unsubscribe = meetups.subscribe(items => {
    		$$invalidate('details', details = items.find(i => i.id === id));
    	});

    	// unsubscribe when the component goes out of scope
    	onDestroy(() => {
    		unsubscribe();
    	});

    	function close() {
    		dispatch("close");
    	}

    	const writable_props = ['id'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Details> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ('id' in $$props) $$invalidate('id', id = $$props.id);
    	};

    	return { id, details, close };
    }

    class Details extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$8, create_fragment$a, safe_not_equal, ["id"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.id === undefined && !('id' in props)) {
    			console.warn("<Details> was created without expected prop 'id'");
    		}
    	}

    	get id() {
    		throw new Error("<Details>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set id(value) {
    		throw new Error("<Details>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/UI/ErrorModal.svelte generated by Svelte v3.7.1 */

    const file$b = "src/UI/ErrorModal.svelte";

    // (7:0) <Modal title="An error occurred" on:close>
    function create_default_slot$5(ctx) {
    	var p, t;

    	return {
    		c: function create() {
    			p = element("p");
    			t = text(ctx.msg);
    			add_location(p, file$b, 7, 1, 119);
    		},

    		m: function mount(target, anchor) {
    			insert(target, p, anchor);
    			append(p, t);
    		},

    		p: function update(changed, ctx) {
    			if (changed.msg) {
    				set_data(t, ctx.msg);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(p);
    			}
    		}
    	};
    }

    function create_fragment$b(ctx) {
    	var current;

    	var modal = new Modal({
    		props: {
    		title: "An error occurred",
    		$$slots: { default: [create_default_slot$5] },
    		$$scope: { ctx }
    	},
    		$$inline: true
    	});
    	modal.$on("close", ctx.close_handler);

    	return {
    		c: function create() {
    			modal.$$.fragment.c();
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			mount_component(modal, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var modal_changes = {};
    			if (changed.$$scope || changed.msg) modal_changes.$$scope = { changed, ctx };
    			modal.$set(modal_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(modal.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(modal.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(modal, detaching);
    		}
    	};
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let { msg } = $$props;

    	const writable_props = ['msg'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<ErrorModal> was created with unknown prop '${key}'`);
    	});

    	function close_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$set = $$props => {
    		if ('msg' in $$props) $$invalidate('msg', msg = $$props.msg);
    	};

    	return { msg, close_handler };
    }

    class ErrorModal extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$9, create_fragment$b, safe_not_equal, ["msg"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.msg === undefined && !('msg' in props)) {
    			console.warn("<ErrorModal> was created without expected prop 'msg'");
    		}
    	}

    	get msg() {
    		throw new Error("<ErrorModal>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set msg(value) {
    		throw new Error("<ErrorModal>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/App.svelte generated by Svelte v3.7.1 */
    const { Error: Error_1$2 } = globals;

    const file$c = "src/App.svelte";

    // (79:0) {#if error}
    function create_if_block_3(ctx) {
    	var current;

    	var errormodal = new ErrorModal({
    		props: { msg: ctx.error.message },
    		$$inline: true
    	});
    	errormodal.$on("close", ctx.resetError);

    	return {
    		c: function create() {
    			errormodal.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(errormodal, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var errormodal_changes = {};
    			if (changed.error) errormodal_changes.msg = ctx.error.message;
    			errormodal.$set(errormodal_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(errormodal.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(errormodal.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(errormodal, detaching);
    		}
    	};
    }

    // (95:1) {:else}
    function create_else_block_1(ctx) {
    	var current;

    	var details = new Details({
    		props: { id: ctx.id },
    		$$inline: true
    	});
    	details.$on("close", ctx.deleteId);

    	return {
    		c: function create() {
    			details.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(details, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var details_changes = {};
    			if (changed.id) details_changes.id = ctx.id;
    			details.$set(details_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(details.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(details.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(details, detaching);
    		}
    	};
    }

    // (86:1) {#if id === null}
    function create_if_block$5(ctx) {
    	var t, current_block_type_index, if_block1, if_block1_anchor, current;

    	var if_block0 = (ctx.editMode) && create_if_block_2$1(ctx);

    	var if_block_creators = [
    		create_if_block_1$1,
    		create_else_block$3
    	];

    	var if_blocks = [];

    	function select_block_type_1(ctx) {
    		if (ctx.isLoading) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_1(ctx);
    	if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c: function create() {
    			if (if_block0) if_block0.c();
    			t = space();
    			if_block1.c();
    			if_block1_anchor = empty();
    		},

    		m: function mount(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t, anchor);
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (ctx.editMode) {
    				if (if_block0) {
    					if_block0.p(changed, ctx);
    					transition_in(if_block0, 1);
    				} else {
    					if_block0 = create_if_block_2$1(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t.parentNode, t);
    				}
    			} else if (if_block0) {
    				group_outros();
    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});
    				check_outros();
    			}

    			var previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx);
    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(changed, ctx);
    			} else {
    				group_outros();
    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});
    				check_outros();

    				if_block1 = if_blocks[current_block_type_index];
    				if (!if_block1) {
    					if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block1.c();
    				}
    				transition_in(if_block1, 1);
    				if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (if_block0) if_block0.d(detaching);

    			if (detaching) {
    				detach(t);
    			}

    			if_blocks[current_block_type_index].d(detaching);

    			if (detaching) {
    				detach(if_block1_anchor);
    			}
    		}
    	};
    }

    // (87:2) {#if editMode}
    function create_if_block_2$1(ctx) {
    	var current;

    	var editmeetup = new EditMeetup({
    		props: { id: ctx.editedId },
    		$$inline: true
    	});
    	editmeetup.$on("close", ctx.close);

    	return {
    		c: function create() {
    			editmeetup.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(editmeetup, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var editmeetup_changes = {};
    			if (changed.editedId) editmeetup_changes.id = ctx.editedId;
    			editmeetup.$set(editmeetup_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(editmeetup.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(editmeetup.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(editmeetup, detaching);
    		}
    	};
    }

    // (92:2) {:else}
    function create_else_block$3(ctx) {
    	var current;

    	var grid = new Grid({
    		props: { meetups: ctx.$meetups },
    		$$inline: true
    	});
    	grid.$on("showdetails", ctx.showDetails);
    	grid.$on("edit", ctx.edit);

    	return {
    		c: function create() {
    			grid.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(grid, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var grid_changes = {};
    			if (changed.$meetups) grid_changes.meetups = ctx.$meetups;
    			grid.$set(grid_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(grid.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(grid.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(grid, detaching);
    		}
    	};
    }

    // (90:2) {#if isLoading}
    function create_if_block_1$1(ctx) {
    	var current;

    	var spinner = new Spinner({ $$inline: true });

    	return {
    		c: function create() {
    			spinner.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(spinner, target, anchor);
    			current = true;
    		},

    		p: noop,

    		i: function intro(local) {
    			if (current) return;
    			transition_in(spinner.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(spinner.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(spinner, detaching);
    		}
    	};
    }

    function create_fragment$c(ctx) {
    	var t0, t1, main, current_block_type_index, if_block1, current;

    	var if_block0 = (ctx.error) && create_if_block_3(ctx);

    	var header = new Header({ $$inline: true });

    	var if_block_creators = [
    		create_if_block$5,
    		create_else_block_1
    	];

    	var if_blocks = [];

    	function select_block_type(ctx) {
    		if (ctx.id === null) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c: function create() {
    			if (if_block0) if_block0.c();
    			t0 = space();
    			header.$$.fragment.c();
    			t1 = space();
    			main = element("main");
    			if_block1.c();
    			attr(main, "class", "svelte-x789jm");
    			add_location(main, file$c, 84, 0, 1541);
    		},

    		l: function claim(nodes) {
    			throw new Error_1$2("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t0, anchor);
    			mount_component(header, target, anchor);
    			insert(target, t1, anchor);
    			insert(target, main, anchor);
    			if_blocks[current_block_type_index].m(main, null);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (ctx.error) {
    				if (if_block0) {
    					if_block0.p(changed, ctx);
    					transition_in(if_block0, 1);
    				} else {
    					if_block0 = create_if_block_3(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t0.parentNode, t0);
    				}
    			} else if (if_block0) {
    				group_outros();
    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});
    				check_outros();
    			}

    			var previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);
    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(changed, ctx);
    			} else {
    				group_outros();
    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});
    				check_outros();

    				if_block1 = if_blocks[current_block_type_index];
    				if (!if_block1) {
    					if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block1.c();
    				}
    				transition_in(if_block1, 1);
    				if_block1.m(main, null);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);

    			transition_in(header.$$.fragment, local);

    			transition_in(if_block1);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(header.$$.fragment, local);
    			transition_out(if_block1);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (if_block0) if_block0.d(detaching);

    			if (detaching) {
    				detach(t0);
    			}

    			destroy_component(header, detaching);

    			if (detaching) {
    				detach(t1);
    				detach(main);
    			}

    			if_blocks[current_block_type_index].d();
    		}
    	};
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let $meetups;

    	validate_store(meetups, 'meetups');
    	component_subscribe($$self, meetups, $$value => { $meetups = $$value; $$invalidate('$meetups', $meetups); });

    	

    	let editMode = null;
    	let id = null;
    	let isLoading = true;
    	let editedId;
    	let error;

    	function close() {
    		resetMode();
    	}

    	function showDetails({ detail }) {
    		$$invalidate('id', id = detail);
    	}

    	function deleteId() {
    		$$invalidate('id', id = null);
    	}

    	function edit({ detail }) {
    		$$invalidate('editedId', editedId = detail);
    		$$invalidate('editMode', editMode = true);
    	}

    	function resetMode() {
    		$$invalidate('editMode', editMode = null);
    		$$invalidate('editedId', editedId = null);
    	}

    	onMount(() => {
    		fetch('https://svelte-test-store.firebaseio.com/meetups.json')
    			.then(res => {
    				if (!res.ok) {
    					throw new Error('oops');
    				}
    				return res.json();
    			})
    			.then(json => {
    				const loadedMeetups = [];
    				for (const key in json) {
    					loadedMeetups.unshift({
    						...json[key], id: key
    					});
    				}
    				meetups.setMeetups(loadedMeetups);
    			})
    			.catch(err => {
    				console.log(err);
    				$$invalidate('error', error = err);
    			})
    			.finally(() => {
    				$$invalidate('isLoading', isLoading = false);
    			});
    	});

    	function resetError() {
    		$$invalidate('error', error = null);
    	}

    	return {
    		editMode,
    		id,
    		isLoading,
    		editedId,
    		error,
    		close,
    		showDetails,
    		deleteId,
    		edit,
    		resetError,
    		$meetups
    	};
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$a, create_fragment$c, safe_not_equal, []);
    	}
    }

    const app = new App({
        target: document.body
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
