import { CallbackHandler } from 'miruken-callback';
import { ContextualHelper } from './helper';

CallbackHandler.implement({
    /**
     * Establishes publish invocation semantics.
     * @method $publish
     * @returns {miruken.callback.CallbackHandler} publish semantics.
     * @for miruken.callback.CallbackHandler
     */
    $publish() {
        let   composer = this;
        const context  = ContextualHelper.resolveContext(composer);
        if (context) {
            composer = context.$descendantOrSelf();
        }
        return composer.$notify();
    },
    $publishFromRoot() {
        let   composer = this;
        const context  = ContextualHelper.resolveContext(composer);
        if (context) {
            composer = context.root.$descendantOrSelf();
        }
        return composer.$notify();
    }
});
