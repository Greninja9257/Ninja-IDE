module.exports = {

    toXy: function(pointset, format) {
        if (format === undefined) {
            return pointset.slice();
        }

        const xPropertyName = format[0].slice(1);
        const yPropertyName = format[1].slice(1);
        const _getXY = function(pt) {
            return [pt[xPropertyName], pt[yPropertyName]];
        };

        return pointset.map(_getXY);
    },

    fromXy: function(pointset, format) {
        if (format === undefined) {
            return pointset.slice();
        }

        const xPropertyName = format[0].slice(1);
        const yPropertyName = format[1].slice(1);
        const _getObj = function(pt) {
            const obj = {};
            obj[xPropertyName] = pt[0];
            obj[yPropertyName] = pt[1];
            return obj;
        };

        return pointset.map(function(pt) {
            return _getObj(pt);
        });
    }

};
