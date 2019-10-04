/**
 * Decorates the index data structure with legacy fields possibly expected by Query Parser.
 *
 * If you add data to an ElasticSearch index in a specific structure, you will need to understand
 * that structure in order to conduct complex search queries against it. We suspect that some of
 * the v1 to v2 transition hiccups come from v2 composing index data in a different structure
 * than v1's Query Parser expects when it composes the ElasticSearch query. As a way of verifying
 * and testing this, this function decorates the index data we're already writing to
 * ElasticSearch with additional fields we think Query Parser is trying to query.
 *
 * @param  {Object} index The original index
 * @return {Object}       The index with additional legacy properties added
 */
const decorateIndexWithLegacyProperties = (index) => {
  const {
    fileUrl,
    title,
    publicationDate,
    uploadDate
  } = index
  return Object.assign({}, index, {
    custom_meta_data: {
      url: fileUrl,
      title: title,
      publishDate: publicationDate || uploadDate,
      publicationDate: publicationDate || uploadDate,
    }
    meta: {
      date: publicationDate || uploadDate,
      raw: {
        UploadDate: uploadDate,
      }
    }
  })
}

module.exports = {
  decorateIndexWithLegacyProperties
}
