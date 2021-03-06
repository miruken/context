import {
    Enum, Protocol, Parenting, Disposing,
    Traversing, TraversingAxis, TraversingMixin,
    $isSomething, $isNothing, $classOf, $equals,
    $decorated, assignID
} from "miruken-core";

import {
    Composition, CompositeHandler, $provide
} from "miruken-callback";

const Axis = Symbol();

/**
 * Represents the state of a {{#crossLink "Context"}}{{/crossLink}}.
 * @class ContextState
 * @extends Enum
 */
export const ContextState = Enum({
    /**
     * Context is active.
     * @property {number} Active
     */
    Active: 1,
    /**
     * Context is in the process of ending.
     * @property {number} Ending
     */        
    Ending: 2,
    /**
     * Context has ended.
     * @property {number} Ended
     */                
    Ended:  3 
});

/**
 * Protocol for observing the lifecycle of
 * {{#crossLink "Context"}}{{/crossLink}}.
 * @class ContextObserver
 * @extends Protocol
 */
export const ContextObserver = Protocol.extend({
    /**
     * Called when a context is in the process of ending.
     * @method contextEnding
     * @param  {Context}  context
     */
    contextEnding(context) {},
    /**
     * Called when a context has ended.
     * @method contextEnded
     * @param  {Context}  context
     */        
    contextEnded(context) {},
    /**
     * Called when a child context is in the process of ending.
     * @method childContextEnding
     * @param  {Context}  childContext
     */
    childContextEnding(childContext) {},
    /**
     * Called when a child context has ended.
     * @method childContextEnded
     * @param  {Context}  childContext
     */        
    childContextEnded(context) {}
});

/**
 * A Context represents the scope at a give point in time.<br/>
 * It has a beginning and an end and can handle callbacks as well as notify observers of lifecycle changes.<br/>
 * In addition, it maintains parent-child relationships and thus can participate in a hierarchy.
 * @class Context
 * @constructor
 * @param  {Context}  [parent]  -  parent context
 * @extends CompositeHandler
 * @uses Parenting
 * @uses Traversing
 * @uses TraversingMixin
 * @uses Disposing
 */    
export const Context = CompositeHandler.extend(
    Parenting, Traversing, Disposing, TraversingMixin, {
        constructor(parent) {
            this.base();

            const _id      = assignID(this),
                  _parent  = parent;
            
            let   _state   = ContextState.Active,
                 _children = [], 
                 _observers;

            this.extend({
                /**
                 * Gets the unique id of this context.
                 * @property {string} id
                 * @readOnly
                 */
                get id() { return _id },
                /**
                 * Gets the context state.
                 * @property {ContextState} state
                 * @readOnly
                 */
                get state() { return _state; },
                /**
                 * Gets the parent context.
                 * @property {Context} parent
                 * @readOnly
                 */                
                get parent() { return _parent; },
                /**
                 * Gets the context children.
                 * @property {Array} children
                 * @readOnly
                 */                                
                get children() { return _children.slice(); },
                /**
                 * Determines if the context has children.
                 * @property {boolean} hasChildren
                 * @readOnly
                 */                                                
                get hasChildren() { return _children.length > 0; },
                /**
                 * Gets the root context.
                 * @property {Context} root
                 * @readOnly
                 */                                
                get root() {
                    let root = this, parent;    
                    while (root && (parent = root.parent)) {
                        root = parent;
                    }
                    return root;
                },
                newChild() {
                    ensureActive();
                    const childContext = new ($classOf(this))(this).extend({
                        end() {
                            const index = _children.indexOf(childContext);
                            if (index < 0) return;
                            const notifier = makeNotifier();
                            notifier.childContextEnding(childContext);
                            _children.splice(index, 1);
                            this.base();
                            notifier.childContextEnded(childContext);                            
                        }
                    });
                    _children.push(childContext);
                    return childContext;
                },
                /**
                 * Stores the object in the context.
                 * @method store
                 * @param  {Object} object  -  object to store
                 * @returns {Context} receiving context.
                 * @chainable
                 */                                                
                store(object) {
                    if ($isSomething(object)) {
                        $provide(this, object);
                    }
                    return this;
                },
                handleCallback(callback, greedy, composer) {
                    let handled = false,
                        axis    = this[Axis];
                    if (!axis) {
                        handled = this.base(callback, greedy, composer);
                        if (handled && !greedy) { return true; }
                        if (_parent) {
                            handled = handled | _parent.handle(callback, greedy, composer);
                        }
                        return !!handled;                        
                    }
                    delete this[Axis];
                    if (axis === TraversingAxis.Self) {
                        return this.base(callback, greedy, composer);
                    } else {
                        this.traverse(axis, node => {
                            handled = handled | ($equals(node, this)
                                    ? this.base(callback, greedy, composer)
                                    : node.handleAxis(TraversingAxis.Self, callback, greedy, composer));
                            return handled && !greedy;
                        }, this);
                    }
                    return !!handled;
                },
                /**
                 * Handles the callback using the traversing axis.
                 * @method handleAxis
                 * @param   {TraversingAxis}  axis            -  any callback
                 * @param   {Object}          callback        -  any callback
                 * @param   {boolean}         [greedy=false]  -  true if handle greedily
                 * @param   {Handler}         [composer]      -  composition handler
                 * @returns {boolean} true if the callback was handled, false otherwise.
                 */                
                handleAxis(axis, callback, greedy, composer) {
                    if (!(axis instanceof TraversingAxis)) {
                        throw new TypeError("Invalid axis type supplied");
                    }        
                    this[Axis] = axis;
                    return this.handle(callback, greedy, composer);
                },
                /**
                 * Subscribes to the context notifications.
                 * @method observe
                 * @param   {ContextObserver}  observer  -  receives notifications
                 * @returns {Function} unsubscribes from context notifications.
                 */                                
                observe(observer) {
                    ensureActive();
                    if ($isNothing(observer)) return;
                    (_observers || (_observers = [])).push(observer);
                    return () => {
                        const index = _observers.indexOf(observer);
                        if (index >= 0) {
                            _observers.splice(index, 1);
                        }
                    };
                },
                /**
                 * Unwinds to the root context.
                 * @method unwindToRootContext
                 * @param   {ContextObserver}  observer  -  receives notifications
                 * @returns {Context} receiving context.
                 * @chainable
                 */                                                
                unwindToRootContext() {
                    let current = this;
                    while (current) {
                        const parent = current.parent;
                        if (parent == null) {
                            current.unwind();
                            return current;
                        }
                        current = parent;
                    }
                    return this;
                },
                /**
                 * Unwinds to the context by ending all children.
                 * @method unwind
                 * @returns {Context} receiving context.
                 * @chainable
                 */
                unwind() {
                    for (const child of this.children) {
                        child.end();
                    }
                    return this;
                },
                /**
                 * Ends the context.
                 * @method end
                 */
                end() { 
                    if (_state == ContextState.Active) {
                        const notifier = makeNotifier();
                        _state = ContextState.Ending;
                        notifier.contextEnding(this);
                        this.unwind();
                        _state = ContextState.Ended;
                        notifier.contextEnded(this);                        
                        _observers = null;
                    }
                },
                dispose() { this.end(); }
            });

            function ensureActive() {
                if (_state != ContextState.Active) {
                    throw new Error("The context has already ended.");
                }
            }

            function makeNotifier() {
                return new ContextObserver(_observers && _observers.slice());
            }
        },
        resolveContext(resolution) {
            const decoratee = this.decoratee;
            return decoratee ? decoratee.resolve(resolution.key) : this;
        }        
});
$provide(Context.prototype, Context, function (resolution) {
    return this.resolveContext(resolution);
});

const axisControl = {
    /**
     * Changes the default traversal axis.
     * @method axis
     * @param   {TraversingAxis}  axis  -  axis
     * @returns {Context} callback handler axis.
     * @for Context
     */
    axis(axis) {
        return this.decorate({
            handleCallback(callback, greedy, composer) {
                if (!(callback instanceof Composition)) {
                    this[Axis]= axis;                        
                }
                return this.base(callback, greedy, composer);
            },
            equals(other) {
                return (this === other) || ($decorated(this) === $decorated(other));
            }
        });
    }},
    applyAxis = axisControl.axis;

TraversingAxis.items.forEach(axis => {
    const key = "$" + axis.name.charAt(0).toLowerCase() + axis.name.slice(1);
    axisControl[key] = function () { return this.axis(axis); }
});

Context.implement(axisControl);

/**
 * Sets the default traversal axis to
 * {{#crossLink "TraversingAxis/Self:property"}}{{/crossLink}}.
 * @method $self
 * @returns {Context} default traversal axis.
 * @for Context
 */

/**
 * Sets the default traversal axis to
 * {{#crossLink "TraversingAxis/Root:property"}}{{/crossLink}}.
 * @method $root
 * @returns {Context} default traversal axis.
 * @for Context
 */

/**
 * Sets the default traversal axis to
 * {{#crossLink "TraversingAxis/Child:property"}}{{/crossLink}}.
 * @method $child
 * @returns {Context} default traversal axis.
 * @for Context
 */

/**
 * Sets the default traversal axis to
 * {{#crossLink "TraversingAxis/Sibling:property"}}{{/crossLink}}.
 * @method $sibling
 * @returns {Context} default traversal axis.
 * @for Context
 */

/**
 * Sets the default traversal axis to
 * {{#crossLink "TraversingAxis/Ancestor:property"}}{{/crossLink}}.
 * @method $ancestor
 * @returns {Context} default traversal axis.
 * @for Context
 */

/**
 * Sets the default traversal axis to
 * {{#crossLink "TraversingAxis/Descendant:property"}}{{/crossLink}}.
 * @method $descendant
 * @returns {Context} default traversal axis.
 * @for Context
 */

/**
 * Sets the default traversal axis to
 * {{#crossLink "TraversingAxis/DescendantReverse:property"}}{{/crossLink}}.
 * @method $descendantReverse
 * @returns {Context} default traversal axis.
 * @for Context
 */        

/**
 * Sets the default traversal axis to
 * {{#crossLink "TraversingAxis/SelfOrChild:property"}}{{/crossLink}}.
 * @method $selfOrChild
 * @returns {Context} default traversal axis.
 * @for Context
 */

/**
 * Sets the default traversal axis to
 * {{#crossLink "TraversingAxis/SelfOrSibling:property"}}{{/crossLink}}.
 * @method $selfOrSibling
 * @returns {Context} default traversal axis.
 * @for Context
 */

/**
 * Sets the default traversal axis to
 * {{#crossLink "TraversingAxis/SelfOrAncestor:property"}}{{/crossLink}}.
 * @method $selfOrAncestor
 * @returns {Context} default traversal axis.
 * @for Context
 */        

/**
 * Sets the default traversal axis to
 * {{#crossLink "TraversingAxis/SelfOrDescendant:property"}}{{/crossLink}}.
 * @method $selfOrDescendant
 * @returns {Context} default traversal axis.
 * @for Context
 */

/**
 * Sets the default traversal axis to
 * {{#crossLink "TraversingAxis/SelfOrDescendantReverse:property"}}{{/crossLink}}.
 * @method $selfOrDescendantReverse
 * @returns {Context} default traversal axis.
 * @for Context
 */

/**
 * Sets the default traversal axis to
 * {{#crossLink "TraversingAxis/SelfSiblingOrAncestor:property"}}{{/crossLink}}.
 * @method $selfSiblingOrAncestor
 * @returns {Context} default traversal axis.
 * @for Context
 */
