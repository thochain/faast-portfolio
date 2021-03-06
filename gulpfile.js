const gulp = require('gulp')
const path = require('path')
const clean = require('gulp-clean')
const run = require('gulp-run-command').default

const { dirs } = require('./etc/common.js')

const ignoredFiles = [
  '!' + path.join(dirs.buildSite, '**/_*'), // exclude folders starting with '_'
  '!' + path.join(dirs.buildSite, '**/_*/**/*'), // exclude files/subfolders in folders starting with '_'
]

gulp.task('lint:js', run('eslint src/'))
gulp.task('lint:ts', run('tslint -p .'))
gulp.task('lint', gulp.parallel(['lint:js', 'lint:ts']))

gulp.task('compile:app', run('webpack --config etc/webpack.config.app.js --progress'))
gulp.task('compile:site', run('react-static build'))

gulp.task('clean', () =>
  gulp.src(dirs.dist, { read: false })
    .pipe(clean()))

const mergeDist = (path) =>
  gulp.src([
    path,
    ...ignoredFiles,
  ]).pipe(gulp.dest(dirs.dist, { overwrite: false }))

gulp.task('dist:app', () => mergeDist(path.join(dirs.buildApp, '**/*')))

gulp.task('dist:site', () => mergeDist(path.join(dirs.buildSite, '**/*')))

gulp.task('build:app', gulp.series('compile:app', 'dist:app'))
gulp.task('build:site', gulp.series('compile:site', 'dist:site'))

const build = gulp.series('lint', 'clean', gulp.parallel(['build:app', 'build:site']))

gulp.task('build', build)

gulp.task('default', build)
