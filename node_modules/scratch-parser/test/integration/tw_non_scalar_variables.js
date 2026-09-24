const test = require('tap').test;
const fs = require('fs');
const path = require('path');
const parser = require('../../index');

test('non scalar variables', function (t) {
    const fixture = fs.readFileSync(path.join(__dirname, '../fixtures/tw_non_scalar_variables.json'), 'utf-8');
    parser(fixture, false, function (err, result) {
        t.equal(err, null);
        t.same(result[0].targets[0].variables['8Ct!xBe$u3!.nz_Bh/]#'][1], {
            hello: 'world'
        });
        t.same(result[0].targets[0].lists['u(}PhnFj*Oe*`Ka~{hhc'][1], [
            {
                a: 1
            },
            {
                b: 2
            }
        ]);
        t.end();
    });
});
