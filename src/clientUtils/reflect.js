function TrexState(superContext) {
    this.superContext = superContext;

    this.reflect = reflect
}

function reflect(dependency, dom, ctx, externalDom = document) {
    var dependents = dom.querySelectorAll("trex-interpolation.__dep_" + dependency + "");
    var length = dependents.length;

    for (var i = 0; i < length; i++) {
        var dependant = dependents[i];
        /* var directChild = null; */
        var parent = dependant.parentNode;
        var nodeIndex = Array.prototype.indexOf.call(parent.childNodes, dependant);

        

        /* if (dependant.hasAttribute("direct-child-cached-id")) {
            directChild = externalDom.getElementById(dependant.getAttribute("direct-child-cached-id"));
        }
        else {
            var directChildId = dependant.closest("." + constants.trexComponentDirectChild).getAttribute("trex-dc-id");
            var externalDirectChildren = externalDom.getElementsByClassName(directChildId);
            var externalId = null;
        
            for (var i = 0; i < externalDirectChildren.length; i++) {
                var child = externalDirectChildren[i];
                var id = child.id;
                if (refIds.indexOf(id) > -1) {
                    externalId = id;
                    break;
                }
            }
            if (externalId) {
                dependant.setAttribute("direct-child-cached-id", externalId);
                directChild = externalDom.getElementById(externalId);
            }
        } */

        var children = externalDom.getElementById(parent.id).childNodes;
        var specificChild = children[nodeIndex];
        var specificChildParent = specificChild.parentNode;

        resolveInterpolation(dependant, ctx, function(toAppend) {
            if (specificChild && specificChild !== toAppend) {
                specificChildParent.replaceChild(toAppend, specificChild);
            }
            else if (!specificChild) {
                specificChildParent.appendChild(toAppend); // should not really be called...
            }
        });
    
    }

    return true;

}
function resolveInterpolation(dependant, ctx, cb) {

    var value = ctx[dependant.getAttribute("local-expression")]();

    if (value.constructor.prototype.toString() === "[object Promise]") {
        return value
            .then(function(data) {
                return data;
            }).catch(function(error) {
                return error;
            }).then(function(data) {
                cb(document.createTextNode(resolveInterpolationValue(data)));
            });
    } else {
        return cb(document.createTextNode(resolveInterpolationValue(value)));
    }
    
}

function resolveInterpolationValue(value) {

    if (!value && value !== 0) {
        return "";
    } else if (~value.constructor.toString().indexOf("function Array()")) {
        return value.join("");
    }

    return value;

}

var trexParser = new DOMParser();