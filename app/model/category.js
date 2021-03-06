/**
 * @desc 分类模型
 */

module.exports = app => {
    const { mongoose } = app
    const { Schema } = mongoose

    const CategorySchema = new Schema({
        // 名称
        name: { type: String, required: true },
        // 描述
        description: { type: String, default: '' },
        // 扩展属性
        extends: [{
            key: { type: String, validate: /\S+/ },
            value: { type: String, validate: /\S+/ }
        }]
    })

    return mongoose.model('Category', app.processSchema(CategorySchema))
}
