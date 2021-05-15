import { JSDOM } from "jsdom";
import parser from "./parser.js";
import { promises as fs } from "fs";
import path from "path";
import { performance } from "perf_hooks";
import esprima from "esprima";
import escodegen from "escodegen";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const constants = Object.freeze({
    trexModuleName: "trex",
    frameId: "__trex_frame_",
    trexComponentAttributeKey: "__trex_component_name",
    trexComponentDirectChild: "trex-c-dc",
    trexIndependentExpressionName: "independent_"
});

/** Reflect JS (critical client side util) */
const reflectJS = fs.readFile(path.resolve(__dirname, "./clientUtils/reflect.js"), "utf8");

/**
 * Compile given string
 * @param {string} code The code to be compiled
 * @returns string compiled code
 */
export const compile = async (code) => {

    const componentsDom = [];
    const componentTemplates = [];
    const componentReferences = [];

    let rest = "";

    const componentEvaluated = componentEvaluator(code);

    const dom = new JSDOM(componentEvaluated);

    const components = [...dom.window.document.querySelectorAll(constants.trexModuleName)];
    const key = constants.trexComponentAttributeKey;

    while (components.length) {
        const component = components[0];
        // TODO: perf gain on id instead of class
        const definition = component.querySelectorAll(":scope script");
        if (definition?.length) {

            const id = generateId(`_${component.getAttribute(key)}`);

            componentsDom.push(component.cloneNode(true));

            const code = [...definition].reduce((t, v) => t + `
                ${v.innerHTML}\n
            `.trim(), "");

            const state = locateStatefulVariables(code, id);

            const names = Array.from(new Set([...state.map(v => v.name), "independent_"]));

            const identifiers = [];
            const parsed = parseJs(code);
            const expression = escodegen.generate(locateIdentifier(names)(parsed, identifiers));

            [...definition].forEach(v => v.remove());

            /* const directChildren = component.querySelectorAll(":scope > *");
            for (const child of directChildren) {
                const id = `trex-dc${generateId("")}`;
                child.classList.add(constants.trexComponentDirectChild);
                child.classList.add(id);

                child.setAttribute("trex-dc-id", id);
            } */
            const interpolationsNodes = [...component.querySelectorAll("[local-expression]")]
            for (const interpolation of interpolationsNodes) {
                const parent = interpolation.parentNode;
                if (parent.id)
                    break;
                const id = `trex-hns${generateId("")}`; // hns = hot node swap

                parent.setAttribute("id", id);
            }




            const html = component.innerHTML.trim();

            console.log(components.length)
            components.push(...component.querySelectorAll(constants.trexModuleName));
            
            componentTemplates.push({
                names,
                code: expression,
                rawHTML: html,
                id,
                name: component.getAttribute(constants.trexComponentAttributeKey)
            });

            component.remove();

            // bad perf
        }
        else {
            componentTemplates.forEach((nonDefinitionComponent, i) => {

                if (nonDefinitionComponent.name === component.getAttribute(key)) {

                    const element = dom.window.document.createElement("div");
                    element.innerHTML = nonDefinitionComponent.rawHTML;
                    const directChildren = element.querySelectorAll(":scope > *");
                    const ids = [];
                    for (const child of directChildren) {
                        if (!child.hasAttribute("id")) {
                            child.setAttribute("id", generateId(""));
                        }
                        ids.push(child.getAttribute("id"));
                    }

                    const interpolations = [...element.querySelectorAll("trex-interpolation")]

                    const localExpressions = componentTemplates[i].localExpressions ?? [];
                    const names = nonDefinitionComponent.names;
                    for (const [i, interpolation] of interpolations.entries()) {
                        
                        if (localExpressions[i]) {
                            const expression = localExpressions[i];
                            interpolation.setAttribute("local-expression", expression.expressionId);

                            for (const identifier of expression.identifiers) {
                                interpolation.classList.add(`__dep_${identifier}`);
                            }
                        }
                        else {
                            
                            const identifiers = [];
                            const textarea = interpolation.childNodes[0];
                            const rawExpression = parseJs(textarea.innerHTML);
                            const expression = escodegen.generate(locateIdentifier(names)(rawExpression, identifiers));
                            textarea.remove();
                            const expressionId = generateId("_local_expression");
                            
                            interpolation.setAttribute("local-expression", expressionId);

                            if (!identifiers.length) {
                                localExpressions.push({
                                    expressionId,
                                    expression,
                                    identifiers: [constants.trexIndependentExpressionName]
                                });

                                interpolation.classList.add(`__dep_${constants.trexIndependentExpressionName}`);
                            } else {
                                localExpressions.push({
                                    expressionId,
                                    expression,
                                    identifiers
                                });

                                for (const identifier of identifiers) {
                                    interpolation.classList.add(`__dep_${identifier}`);
                                }
                            }
                        }
                    }

                    const html = element.innerHTML;

                    if (!componentTemplates[i].localExpressions)
                        componentTemplates[i].localExpressions = localExpressions;

                    componentReferences.push({ // creates ghost id...?
                        template: nonDefinitionComponent.id,
                        name: nonDefinitionComponent.name,
                        ids,
                        html
                    });
                    component.outerHTML = html;
                }

            });
        }

        components.splice(0, 1);

    }



    const iframes = await constructComponentIframes(componentTemplates, componentReferences);



    dom.window.document.body.insertAdjacentHTML("beforeend", iframes);

    return dom.window.document.querySelector("html").outerHTML;

}

const parseJs = js => {

    //console.trace(js);
    return esprima.parse(js);

}

const locateStatefulVariables = (js, id) => {
    const parsed = parseJs(js);
    const accumulated = [];

    const parse = (node, i, arr) => {

        if (node.type === "ExpressionStatement") {
            if (node?.expression?.argument?.callee?.body)
                node?.expression?.argument?.callee?.body?.body?.forEach?.((node, i, arr) => {
                    parse(node, i, arr);
                });
            else if (node?.expression?.argument?.callee?.body?.body)
                node?.expression?.argument?.callee?.body?.body?.forEach?.((node, i, arr) => {
                    parse(node, i, arr);
                });



        }
        else if (node.type === "LabeledStatement" && node.label.name === "_") {
            const { name } = node.body.expression.left;
            const functionName = `${id}_reactive_${name}_${i}_`;

            accumulated.push({
                name,
                id,
                functionName,
                dependents: []
            });
        } else if (node.type === "VariableDeclaration") {
            node.declarations.forEach(declaration => {

                const invalid = accumulated.some(v => v.name === declaration.id.name) ?? {};
                if (invalid) throw `Cannot declare variable of name "${declaration.id.name}" since it's already declared as state. Please omit the variable declaration or change the name."`;
            })

        } else {
            //console.log(JSON.stringify(node, null, 4));
            if (node?.body?.forEach)
                node?.body?.forEach?.(parse);
            else if (node?.body?.body?.forEach)
                node?.body?.body?.forEach?.(parse);
        }
    }

    parsed.body.forEach(parse);

    return accumulated;
}

const constructComponentIframes = async (componentTemplates, componentReferences) => {

    return `
        <script>
            var constants = ${JSON.stringify(constants)};

            ${await reflectJS}
        </script>
    ` + componentTemplates.reduce((t, component) => {

        return t + constructComponent(component, componentReferences.filter(v => v.template === component.id));

    }, "");

}

const constructComponent = (component, refs) => {

    const frameId = constants.frameId + generateId();

    return `

    <script trex-component="true">
        /*
            COMPONENT NAME:  ${component.name}
            CACHED:          ?
            REFERENCES #:    ${refs.length}
        */
        

        function ${component.id} (domString) {
            var __trex_state = new TrexState(this);
            this.state = __trex_state;
            var dom = trexParser.parseFromString(domString, "text/html");
            domString = null; //gc help

            /* Reactive state */
            ${component.names.reduce((t, v) => t + `Object.defineProperty.call(this, __trex_state, "${v}", {
                get() { return this["__${v}__"]; },
                set(v) { return function() {
                    var result = this["__${v}__"] = v;
                    var ctx = this;
                    window.requestAnimationFrame(function() {
                        this.reflect("${v}", dom, ctx.superContext);
                    });
                    return result;
                }.call(this) },
            });`, "")}
            __trex_state["${constants.trexIndependentExpressionName}"] = undefined;

            /* Component code */
            ${component.code}

            /* Local expressions */
            ${component.localExpressions?.map(v => {
                return `this.${v.expressionId} = function() { return ${v.expression} };`
            }).join("\n")}

            return this;
        }

            ${refs.map(v => {
        return `
            !function() {
                var me = new ${component.id}("${v.html.replace(/"/g, "\\\"").replace(/\n/g, "\\n")}");
            }();`
    }).join("\n")
        }
    </script>
    `;

}


const componentEvaluator = (code) => {
    let results = "";

    parser.HTMLParser(code, {
        start: (tag, attrs, unary) => {
            if (isComponentTag(tag)) {
                attrs.push({
                    name: "__trex_module",
                    value: true,
                }, {
                    name: constants.trexComponentAttributeKey,
                    value: tag
                });

                results += `<${constants.trexModuleName}`;
            }
            else {
                results += `<${tag}`;
            }


            results += attrs
                .reduce((t, { name, value }, _, arr) => {
                    return `${t} ${name}="${value}"`;
                }, "");

            results += (unary ? "/" : "") + ">";
        },
        end: tag => {
            if (isComponentTag(tag)) {
                results += `</${constants.trexModuleName}>`;
            }
            else {
                results += `</${tag}>`;
            }

        },
        chars: text => {
            results += text
                .replace(/\{\{/g, "<trex-interpolation><textarea hidden>")
                .replace(/\}\}/g, "</textarea></trex-interpolation>");
        },
        comment: text => {
            results += `<!--${text}-->`;
        },
        special: text => text
    });

    return results;
}
const generateId = (name = "") => {
    return "__" + (performance.now() + "").replace(".", "") + name;
}

const locateIdentifier = names => (object, identifiers = []) => {
    const entries = Object.entries(object);

    return Object.fromEntries(entries.map(([key, value], i, arr) => {
        if (value instanceof Array) return [key, value.map(value => locateIdentifier(names)(value, identifiers))];
        if (JSON.parse(JSON.stringify(value))?.constructor === Object) return [key, locateIdentifier(names)(value, identifiers)];
        if (key === "type" && value === "FunctionDeclaration" && names.includes(arr?.[i + 1]?.[1]?.name)) {
            throw `Cannot declare function named "${arr[i + 1][1].name}" because it is already declared as state. Consider renaming the function or omitting the declaration.`;
        }
        else if (key === "name" && names.includes(value) && arr?.[i - 1]?.[1] === "Identifier") {
            identifiers.push(value);
            return [key, `__trex_state["${value}"]`];
        }
        return [key, value];
    }));

}

const isComponentTag = tag => tag.substr(0, 1).toUpperCase() === tag.substr(0, 1);